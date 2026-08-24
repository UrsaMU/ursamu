// ─── GM Plugin Hooks ──────────────────────────────────────────────────────────
//
// Registers all game-event listeners that drive the agentic GM:
//   - player:pose / player:say  → round contributions
//   - player:move               → scene page on room entry
//   - player:login / logout     → greet / session summary triggers
//   - scene:created             → log new scene
//   - scene:pose                → round contribution (type="pose" only)
//   - scene:set                 → GM narration draft → private page to staff
//   - scene:clear               → cache invalidation
//   - job hooks                 → cache invalidation + job-review graph
//   - gm:system:register        → peer plugin registers a game system at runtime
//   - shadowrun:roll            → inject SR4 dice result into open round context
//   - Periodic timeout sweep    → fires adjudication when timeout expires
//
// This module exports a single registerHooks(ctx) function called from index.ts.

import { gameHooks } from "@ursamu/mush";
import { jobHooks } from "@ursamu/jobs";
import { sessionCache } from "./context/cache.ts";
import { embedText } from "./rag.ts";
import {
  addPose,
  buildRoundSummary,
  closeRound,
  collectTimedOutRounds,
  getOpenRound,
  markRoundAdjudicating,
  openRound,
} from "./round-manager.ts";
import { loadRoomContext } from "./context/loader.ts";
import { gmExchanges, gmRounds } from "./db.ts";
import type { IGMGraphs } from "./graphs/index.ts";
import {
  runPoseGraph,
  runScenePageGraph,
  runSceneSetGraph,
} from "./graphs/index.ts";
import type { IGMConfig, IGMContribution, IGMExchange } from "./schema.ts";
import type { IInjectOptions } from "./context/injector.ts";
import { nanoid } from "./ingestion/util.ts";

interface IGameHooks {
  on(event: string, cb: (event: unknown) => void): void;
}
import {
  getGameSystem as getSystem,
  registerGameSystem,
} from "./systems/index.ts";
import type {
  ISrRollEvent,
  ISrSystemRegisterEvent,
} from "./game-hooks-augment.ts";
import { registerUtopiaHooks } from "./hooks-utopia.ts";

// ─── Hook context ─────────────────────────────────────────────────────────────

export interface IHookContext {
  /** Live config — always re-read (watch/mode changes mid-session). */
  getConfig: () => Promise<IGMConfig>;
  /** @deprecated use getConfig() — kept briefly for call-site migration */
  config: IGMConfig;
  graphs: IGMGraphs;
  /** Sends a page (private message) to a player. */
  page: (playerId: string, message: string) => void;
  /** Broadcasts to all connected players in a room. */
  broadcast: (
    roomId: string,
    message: string,
  ) => void | Promise<void>;
  /** Returns a map of playerId → playerName for players in a room. */
  getPlayersInRoom: (roomId: string) => Promise<Map<string, string>>;
  /** Current open session id (null if no session open). */
  getSessionId: () => string | null | Promise<string | null>;
}

// ─── Shared helper: build IInjectOptions ─────────────────────────────────────

async function buildInjectOpts(
  ctx: IHookContext,
  roomId: string,
  inRoomPlayerIds: string[],
): Promise<IInjectOptions> {
  const config = await ctx.getConfig();
  const system = getSystem(config.systemId);

  // Keep sheet loader aligned with active system (CPR → cpr.players)
  const col = config.charCollection ||
    system.charCollection ||
    "server.playbooks";
  sessionCache.setCharCollection(col);
  // Always refresh characters before adjudicating
  sessionCache.invalidate("characters");

  const [snapshot, lore] = await Promise.all([
    sessionCache.getSnapshot(),
    sessionCache.getLore(),
  ]);

  const recentExchanges = await fetchRecentExchanges(roomId);

  const roomCtx = await loadRoomContext(
    roomId,
    snapshot,
    inRoomPlayerIds,
    recentExchanges.map((e) => `[${e.type}] ${e.input}`),
  );

  console.log(
    `[GM] inject room=${roomId} system=${system.id} ` +
      `chars=${snapshot.characters.length} ` +
      `inScene=${roomCtx.playersInRoom.length} ` +
      `scene=${roomCtx.scene?.title ?? "none"}`,
  );

  return {
    config,
    system,
    snapshot,
    roomCtx,
    lorePages: lore,
    recentExchanges,
    graphSuffix: "", // overridden by each graph's run function
    inRoomPlayerIds,
    roomId,
  };
}

async function fetchRecentExchanges(roomId: string): Promise<IGMExchange[]> {
  const all = (await gmExchanges.query(
    {
      roomId,
    } as Parameters<typeof gmExchanges.query>[0],
  )) as IGMExchange[];
  return all
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-20);
}

// ─── Adjudication helper ─────────────────────────────────────────────────────

async function adjudicateRound(
  ctx: IHookContext,
  roundId: string,
  roomId: string,
): Promise<void> {
  const round = await gmRounds.queryOne(
    {
      id: roundId,
    } as Parameters<typeof gmRounds.queryOne>[0],
  ) as import("./schema.ts").IGMRound | null;

  if (!round || round.status === "closed") return;

  await markRoundAdjudicating(roundId);

  const playerIds = round.contributions.map((c) => c.playerId);
  const opts = await buildInjectOpts(ctx, roomId, playerIds);

  const roundSummary = buildRoundSummary(round);

  let output = "";
  try {
    output = await runPoseGraph(ctx.graphs.pose, {
      opts: { ...opts },
      roundSummary,
    });
  } catch (e) {
    console.error("[GM] pose graph error:", e);
    output = "[GM is temporarily unavailable. Please try again.]";
  }

  if (output) {
    try {
      await ctx.broadcast(roomId, output);
    } catch (err) {
      console.error("[GM] broadcast after pose failed:", err);
    }
  }

  try {
    await closeRound(roundId);
  } catch (err) {
    console.error("[GM] closeRound error:", err);
  }

  // Store the exchange (never crash the server on log failure)
  try {
    const embedding = await embedText(roundSummary + " " + output);
    await gmExchanges.create(
      {
        id: nanoid(),
        type: "pose",
        roomId,
        input: roundSummary,
        output,
        toolsUsed: [],
        timestamp: Date.now(),
        embedding,
      },
    );
  } catch (err) {
    console.error("[GM] exchange log error:", err);
  }
}

// ─── Register all hooks ───────────────────────────────────────────────────────

export function registerHooks(ctx: IHookContext): void {

  async function liveConfig(): Promise<IGMConfig> {
    return await ctx.getConfig();
  }

  // ── player:pose ──────────────────────────────────────────────────────────────

  gameHooks.on("player:pose", async (e) => {
    try {
      const { actorId, roomId, content } = e;
      const cfg = await ctx.getConfig();

      if (!cfg.watchedRooms.includes(roomId)) return;
      if (cfg.ignoredPlayers.includes(actorId)) return;
      if (cfg.mode === "hybrid") return; // hybrid: staff only

      const playerNames = await ctx.getPlayersInRoom(roomId);
      const inRoom = [...playerNames.keys()];

      // Open a round if none is open
      let round = await getOpenRound(roomId);
      if (!round) {
        const sessionId =
          (await ctx.getSessionId()) ?? "no-session";
        round = await openRound(
          roomId,
          sessionId,
          inRoom,
          playerNames,
          cfg.roundTimeoutSeconds,
        );
      }

      const { round: updated, allReady } = await addPose(
        roomId,
        actorId,
        content,
      );
      if (!updated) return;

      console.log(
        `[GM] pose from ${actorId} in ${roomId} ` +
          `ready=${allReady} contribs=${updated.contributions.length}`,
      );

      if (allReady) {
        ctx.page(actorId, "Got it — adjudicating…");
        await adjudicateRound(ctx, updated.id, roomId);
      } else {
        const waiting = updated.contributions
          .filter((c) => !c.ready)
          .map((c) => c.playerName)
          .join(", ");
        ctx.page(
          actorId,
          waiting
            ? `Noted. Waiting on: ${waiting}`
            : "Noted. Waiting for the round to close.",
        );
      }
    } catch (err) {
      // Never let GM hook failures kill the game process
      console.error("[GM] player:pose handler error:", err);
    }
  });

  // ── player:say ───────────────────────────────────────────────────────────────
  // Treat +say as a pose contribution (same round logic).

  gameHooks.on("player:say", async (e) => {
    try {
      const { actorId, actorName: _actorName, roomId, message } =
        e;
      const cfg = await ctx.getConfig();

      if (!cfg.watchedRooms.includes(roomId)) return;
      if (cfg.ignoredPlayers.includes(actorId)) return;
      if (cfg.mode === "hybrid") return;

      const playerNames = await ctx.getPlayersInRoom(roomId);
      const inRoom = [...playerNames.keys()];

      let round = await getOpenRound(roomId);
      if (!round) {
        round = await openRound(
          roomId,
          (await ctx.getSessionId()) ?? "no-session",
          inRoom,
          playerNames,
          cfg.roundTimeoutSeconds,
        );
      }

      const sayText = `${_actorName} says: "${message}"`;
      const { round: updated, allReady } = await addPose(
        roomId,
        actorId,
        sayText,
        _actorName,
      );
      if (!updated) return;

      console.log(
        `[GM] say from ${actorId} in ${roomId} ready=${allReady}`,
      );

      if (allReady) {
        ctx.page(actorId, "Got it — adjudicating…");
        await adjudicateRound(ctx, updated.id, roomId);
      } else {
        const waiting = updated.contributions
          .filter((c) => !c.ready)
          .map((c) => c.playerName)
          .join(", ");
        ctx.page(
          actorId,
          waiting
            ? `Noted. Waiting on: ${waiting}`
            : "Noted. Waiting for the round to close.",
        );
      }
    } catch (err) {
      console.error("[GM] player:say handler error:", err);
    }
  });

  // ── player:move ──────────────────────────────────────────────────────────────
  // Page entering player with scene + recent activity summary.

  gameHooks.on("player:move", async (e) => {
    try {
      const { actorId, actorName, toRoomId } = e;

      if (!(await liveConfig()).watchedRooms.includes(toRoomId)) return;
      if ((await liveConfig()).ignoredPlayers.includes(actorId)) return;
      if (!(await liveConfig()).autoframe) return;

      const playerNames = await ctx.getPlayersInRoom(toRoomId);
      const inRoom = [...playerNames.keys()];
      const opts = await buildInjectOpts(ctx, toRoomId, inRoom);

      const recentExchanges = await fetchRecentExchanges(toRoomId);
      const recentActivity = recentExchanges
        .slice(-5)
        .map((ex) => ex.output.slice(0, 200))
        .join("\n\n");

      let pageText = "";
      try {
        pageText = await runScenePageGraph(ctx.graphs.scenePage, {
          opts,
          playerName: actorName,
          recentActivity,
        });
      } catch (err) {
        console.error("[GM] scene-page graph error:", err);
      }

      if (pageText) {
        ctx.page(actorId, pageText);
      }

      sessionCache.invalidate("characters");
    } catch (err) {
      console.error("[GM] player:move handler error:", err);
    }
  });

  // ── player:login ─────────────────────────────────────────────────────────────

  gameHooks.on("player:login", async (e) => {
    try {
      if (!(await liveConfig()).greet) return;
      if ((await liveConfig()).ignoredPlayers.includes(e.actorId)) return;

      const sessionId = await ctx.getSessionId();
      if (!sessionId) {
        ctx.page(
          e.actorId,
          "[GM] No active session. Staff: use " +
            "+gm/session/open to start one.",
        );
        return;
      }

      const snapshot = await sessionCache.getSnapshot();
      const charCount = snapshot.characters.length;
      const frontCount = snapshot.fronts.length;

      ctx.page(
        e.actorId,
        `[GM] Session active. ${charCount} approved character(s), ` +
          `${frontCount} active front(s). ` +
          `Pose in a watched room when ready.`,
      );
    } catch (err) {
      console.error("[GM] player:login handler error:", err);
    }
  });

  // ── player:logout ─────────────────────────────────────────────────────────────

  gameHooks.on("player:logout", (_e) => {
    // Invalidate character cache since occupancy may have changed
    sessionCache.invalidate("characters");
  });

  // ── scene:created ─────────────────────────────────────────────────────────────
  // Log new scene opens. No round management needed -- rounds are room-scoped
  // and will open naturally when the first pose arrives.

  gameHooks.on("scene:created", async (e) => {
    try {
      if (!(await liveConfig()).watchedRooms.includes(e.roomId)) {
        return;
      }
      console.log(
        `[GM] Scene created: "${e.sceneName}" (${e.sceneId}) ` +
          `in room ${e.roomId} by ${e.actorName}.`,
      );
    } catch (err) {
      console.error("[GM] scene:created handler error:", err);
    }
  });

  // ── scene:pose ────────────────────────────────────────────────────────────────
  // Treat scene poses (type="pose") as round contributions, same as player:pose.
  // OOC comments and scene-set entries are skipped here.

  gameHooks.on("scene:pose", async (e) => {
    try {
      const { actorId, roomId, msg, type } = e as unknown as {
        actorId: string;
        actorName: string;
        roomId: string;
        msg: string;
        type: string;
      };

      if (type !== "pose") return; // ooc and set are handled elsewhere
      if (!(await liveConfig()).watchedRooms.includes(roomId)) return;
      if ((await liveConfig()).ignoredPlayers.includes(actorId)) return;
      if ((await liveConfig()).mode === "hybrid") return;

      const playerNames = await ctx.getPlayersInRoom(roomId);
      const inRoom = [...playerNames.keys()];

      let round = await getOpenRound(roomId);
      if (!round) {
        round = await openRound(
          roomId,
          (await ctx.getSessionId()) ?? "no-session",
          inRoom,
          playerNames,
          (await liveConfig()).roundTimeoutSeconds,
        );
      }

      const { round: updated, allReady } = await addPose(
        roomId,
        actorId,
        msg,
      );
      if (!updated) return;

      if (allReady) {
        await adjudicateRound(ctx, updated.id, roomId);
      }
    } catch (err) {
      console.error("[GM] scene:pose handler error:", err);
    }
  });

  // ── scene:set ─────────────────────────────────────────────────────────────────
  // When a player posts a scene-set description, the GM drafts a narration and
  // pages it privately to the staff member. They can edit and broadcast it with
  // +gm/scene/publish.

  gameHooks.on("scene:set", async (e) => {
    try {
      const { actorId, actorName, roomId, description } =
        e as unknown as {
          actorId: string;
          actorName: string;
          roomId: string;
          description: string;
        };

      if (!(await liveConfig()).watchedRooms.includes(roomId)) return;

      const playerNames = await ctx.getPlayersInRoom(roomId);
      const inRoom = [...playerNames.keys()];
      const opts = await buildInjectOpts(ctx, roomId, inRoom);

      let draft = "";
      try {
        draft = await runSceneSetGraph(ctx.graphs.sceneSet, {
          opts,
          actorName,
          description,
        });
      } catch (err) {
        console.error("[GM] scene-set draft graph error:", err);
      }

      if (draft) {
        ctx.page(
          actorId,
          `[GM DRAFT] Review and edit, then use ` +
            `+gm/scene/publish to broadcast:\n\n${draft}`,
        );
      }
    } catch (err) {
      console.error("[GM] scene:set handler error:", err);
    }
  });

  // ── scene:title ───────────────────────────────────────────────────────────────
  // No GM action needed -- just log for observability.

  gameHooks.on("scene:title", (e) => {
    console.log(
      `[GM] Scene "${e.sceneId}" renamed: "${e.oldName}" -> "${e.newName}" by ${e.actorName}.`,
    );
  });

  // ── scene:clear ───────────────────────────────────────────────────────────────
  // Invalidate session cache when a scene closes/finishes.

  gameHooks.on("scene:clear", (_e) => {
    sessionCache.invalidate("characters");
  });

  // ── job hooks ─────────────────────────────────────────────────────────────────
  // Invalidate caches when underlying data changes.

  jobHooks.on("job:created", (_job) => {
    sessionCache.invalidate("jobs");
  });

  jobHooks.on("job:resolved", (_job) => {
    sessionCache.invalidate("jobs");
  });

  jobHooks.on("job:closed", (_job) => {
    sessionCache.invalidate("jobs");
  });

  // ── Round timeout sweep ───────────────────────────────────────────────────────
  // Poll every 30 s; adjudicate any round whose timeoutAt has passed.

  const SWEEP_INTERVAL_MS = 30_000;

  async function timeoutSweep(): Promise<void> {
    try {
      const timedOut = await collectTimedOutRounds();
      for (const round of timedOut) {
        if (!(await liveConfig()).watchedRooms.includes(round.roomId)) continue;
        console.log(
          `[GM] Round ${round.id} in room ${round.roomId} timed out -- adjudicating.`,
        );
        await adjudicateRound(ctx, round.id, round.roomId);
      }
    } catch (e) {
      console.error("[GM] timeout sweep error:", e);
    }
  }

  setInterval(() => {
    timeoutSweep().catch((e) => console.error("[GM] sweep:", e));
  }, SWEEP_INTERVAL_MS);

  // ── gm:system:register ────────────────────────────────────────────────────────
  // A peer plugin (e.g. shadowrun) emits this event to register a game system
  // with ai-gm at runtime without requiring a restart.

  const gh = gameHooks as unknown as IGameHooks;
  gh.on("gm:system:register", async (event: unknown) => {
    const { system } = event as ISrSystemRegisterEvent;
    if (!system?.id) return;
    try {
      // deno-lint-ignore no-explicit-any
      registerGameSystem(system as any);

      const charCollection =
        (system as Record<string, unknown>).charCollection;
      const cfg = await liveConfig();
      const patch: Record<string, unknown> = {};

      // Auto-activate when still on placeholder "generic"
      if (!cfg.systemId || cfg.systemId === "generic") {
        patch.systemId = system.id;
      }

      if (typeof charCollection === "string" && charCollection) {
        patch.charCollection = charCollection;
        sessionCache.setCharCollection(charCollection);
        console.log(
          `[GM] Character collection → "${charCollection}" ` +
            `for system "${system.id}".`,
        );
      }

      // CPR / Night City persona when activating Cyberpunk RED
      if (
        system.id === "cyberpunk-red" &&
        (cfg.systemId === "generic" ||
          cfg.systemId === "cyberpunk-red" ||
          !cfg.systemId)
      ) {
        patch.systemId = "cyberpunk-red";
        patch.persona = {
          name: "Night City",
          tone:
            "gritty cyberpunk noir, chrome and blood, Night City 2045",
          style:
            "terse, visceral, present tense, second person, " +
            "fiction-first, Cyberpunk RED core rules",
          oocBrackets: true,
        };
      }

      if (
        system.id === "utopia" &&
        (cfg.systemId === "generic" ||
          cfg.systemId === "utopia" ||
          !cfg.systemId)
      ) {
        patch.systemId = "utopia";
        patch.persona = {
          name: "The City",
          tone:
            "neo-future after The Fall, hope and inequality",
          style:
            "terse, present tense, the city as judge not companion",
          oocBrackets: true,
        };
      }

      if (Object.keys(patch).length) {
        const { saveConfig } = await import("./providers.ts");
        await saveConfig(patch);
        console.log(
          `[GM] Active system set to "${
            patch.systemId ?? cfg.systemId
          }".`,
        );
      }

      console.log(
        `[GM] Game system "${system.id}" registered ` +
          `via gm:system:register.`,
      );

      // Subscribe to system-declared GM events (CPR rolls, hits, …)
      const events = (event as {
        events?: { name: string; cue?: string }[];
      }).events;
      if (Array.isArray(events)) {
        for (const ev of events) {
          if (!ev?.name) continue;
          const evtName = ev.name;
          const cue = ev.cue ?? evtName;
          // deno-lint-ignore no-explicit-any
          (gameHooks as any).on?.(evtName, async (payload: {
            roomId?: string;
            playerId?: string;
            playerName?: string;
            summary?: string;
          }) => {
            try {
              const roomId = String(payload.roomId ?? "");
              if (!roomId) return;
              const cfg = await liveConfig();
              if (!cfg.watchedRooms.includes(roomId) &&
                !cfg.watchedRooms.map(String).includes(roomId)) {
                // still inject if open round exists
              }
              if (
                (payload as { autoWatch?: boolean }).autoWatch
              ) {
                const { loadConfig, saveConfig } = await import(
                  "./providers.ts"
                );
                const live = await loadConfig();
                if (!live.watchedRooms.includes(roomId)) {
                  await saveConfig({
                    watchedRooms: [
                      ...live.watchedRooms,
                      roomId,
                    ],
                  });
                }
              }
              const note = `[${cue}] ${payload.summary ?? ""}`.trim();
              const round = await getOpenRound(roomId);
              if (round && payload.playerId) {
                await injectRollIntoRound(
                  round.id,
                  payload.playerId,
                  note,
                );
              }
            } catch (err) {
              console.error(`[GM] event ${evtName}:`, err);
            }
          });
          console.log(`[GM] Subscribed to ${evtName}`);
        }
      }
    } catch (e: unknown) {
      console.error("[GM] gm:system:register failed:", e);
    }
  });

  // Mission run started — ensure room is watched
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on?.("cpr:run:started", async (payload: {
    roomId?: string;
    title?: string;
  }) => {
    try {
      const roomId = String(payload.roomId ?? "");
      if (!roomId) return;
      const { loadConfig, saveConfig } = await import("./providers.ts");
      const cfg = await loadConfig();
      if (!cfg.watchedRooms.includes(roomId)) {
        await saveConfig({
          watchedRooms: [...cfg.watchedRooms, roomId],
        });
        console.log(
          `[GM] Auto-watched room ${roomId} for run ` +
            `"${payload.title ?? ""}"`,
        );
      }
    } catch (err) {
      console.error("[GM] cpr:run:started:", err);
    }
  });

  // ── shadowrun:roll ────────────────────────────────────────────────────────────
  // Shadowrun plugin emits this after every +roll / +roll/edge.
  // Inject the result as a note on the roller's round contribution so the
  // GM LLM sees the mechanical outcome when it adjudicates the round.
  // If no round is open, store as a gmExchange so it appears in recentExchanges.

  registerUtopiaHooks({
    getConfig: liveConfig,
    graphs: ctx.graphs,
    broadcast: ctx.broadcast,
    getPlayersInRoom: ctx.getPlayersInRoom,
    getSessionId: ctx.getSessionId,
    buildInjectOpts: (roomId, ids) =>
      buildInjectOpts(ctx, roomId, ids),
  });

  gh.on("shadowrun:roll", async (event: unknown) => {
    const e = event as ISrRollEvent;
    if (!(await liveConfig()).watchedRooms.includes(e.roomId)) return;

    const note = formatSrRollNote(e);

    const round = await getOpenRound(e.roomId);
    if (round && round.status === "open") {
      await injectRollIntoRound(round.id, e.playerId, note);
      return;
    }

    const embedding = await embedText(note);
    await gmExchanges.create({
      id: nanoid(),
      type: "roll",
      roomId: e.roomId,
      playerId: e.playerId,
      playerName: e.playerName,
      input: note,
      output: "",
      toolsUsed: [],
      timestamp: Date.now(),
      embedding,
    });
  });

  console.log("[GM] Hooks registered.");
}

// ─── SR4 roll helpers ─────────────────────────────────────────────────────────

/**
 * Build a plain-text note describing an SR4 dice roll result.
 * Plain text (no MUSH codes) — this goes into the LLM system prompt context.
 */
function formatSrRollNote(e: ISrRollEvent): string {
  const edgeTag = e.edgeUsed ? " [Edge]" : "";
  const hitLine = e.threshold !== undefined
    ? `${e.hits} hits vs threshold ${e.threshold} — ${
      e.success ? "SUCCESS" : "FAIL"
    }`
    : `${e.hits} hits`;

  const glitchTag = e.critGlitch
    ? " CRITICAL GLITCH"
    : e.glitch
    ? " GLITCH"
    : "";

  return `[SR4 ROLL${edgeTag}] ${e.playerName}: ${e.pool} dice → ${hitLine}${glitchTag}`;
}

/**
 * Append a roll note to a player's contribution poses inside an open round
 * WITHOUT marking them as ready (a roll is context, not a full pose).
 */
async function injectRollIntoRound(
  roundId: string,
  playerId: string,
  note: string,
): Promise<void> {
  const round = await gmRounds.queryOne(
    { id: roundId } as Parameters<typeof gmRounds.queryOne>[0],
  ) as { id: string; contributions: IGMContribution[] } | null;

  if (!round) return;

  const updated = round.contributions.map((
    c: IGMContribution,
  ): IGMContribution =>
    c.playerId === playerId
      ? { ...c, poses: [...c.poses, note] } // ready stays unchanged
      : c
  );

  await gmRounds.modify(
    { id: roundId } as Parameters<typeof gmRounds.modify>[0],
    "$set",
    { contributions: updated },
  );
}
