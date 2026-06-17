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

import { gameHooks } from "ursamu";
import { jobHooks } from "ursamu/jobs";
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

// ─── Hook context ─────────────────────────────────────────────────────────────

export interface IHookContext {
  config: IGMConfig;
  graphs: IGMGraphs;
  /** Sends a page (private message) to a player. */
  page: (playerId: string, message: string) => void;
  /** Broadcasts to all connected players in a room. */
  broadcast: (roomId: string, message: string) => void;
  /** Returns a map of playerId → playerName for players in a room. */
  getPlayersInRoom: (roomId: string) => Promise<Map<string, string>>;
  /** Current open session id (null if no session open). */
  getSessionId: () => string | null;
}

// ─── Shared helper: build IInjectOptions ─────────────────────────────────────

async function buildInjectOpts(
  ctx: IHookContext,
  roomId: string,
  inRoomPlayerIds: string[],
): Promise<IInjectOptions> {
  const [snapshot, lore] = await Promise.all([
    sessionCache.getSnapshot(),
    sessionCache.getLore(),
  ]);

  const _playerNames = await ctx.getPlayersInRoom(roomId);
  const recentExchanges = await fetchRecentExchanges(roomId);

  const roomCtx = await loadRoomContext(
    roomId,
    snapshot,
    inRoomPlayerIds,
    recentExchanges.map((e) => `[${e.type}] ${e.input}`),
  );

  return {
    config: ctx.config,
    system: getSystem(ctx.config.systemId),
    snapshot,
    roomCtx,
    lorePages: lore,
    recentExchanges,
    graphSuffix: "", // overridden by each graph's run function
    inRoomPlayerIds,
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
    ctx.broadcast(roomId, output);
  }

  await closeRound(roundId);

  // Store the exchange
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
}

// ─── Register all hooks ───────────────────────────────────────────────────────

export function registerHooks(ctx: IHookContext): void {
  // ── player:pose ──────────────────────────────────────────────────────────────

  gameHooks.on("player:pose", async (e) => {
    const { actorId, actorName: _actorName, roomId, content } = e;

    if (!ctx.config.watchedRooms.includes(roomId)) return;
    if (ctx.config.ignoredPlayers.includes(actorId)) return;
    if (ctx.config.mode === "hybrid") return; // hybrid: staff-triggered only

    const playerNames = await ctx.getPlayersInRoom(roomId);
    const inRoom = [...playerNames.keys()];

    // Open a round if none is open
    let round = await getOpenRound(roomId);
    if (!round) {
      const sessionId = ctx.getSessionId() ?? "no-session";
      const nameMap = playerNames;
      round = await openRound(
        roomId,
        sessionId,
        inRoom,
        nameMap,
        ctx.config.roundTimeoutSeconds,
      );
    }

    const { round: updated, allReady } = await addPose(
      roomId,
      actorId,
      content,
    );
    if (!updated) return;

    if (allReady) {
      await adjudicateRound(ctx, updated.id, roomId);
    }
  });

  // ── player:say ───────────────────────────────────────────────────────────────
  // Treat +say as a pose contribution (same round logic).

  gameHooks.on("player:say", async (e) => {
    const { actorId, actorName: _actorName, roomId, message } = e;

    if (!ctx.config.watchedRooms.includes(roomId)) return;
    if (ctx.config.ignoredPlayers.includes(actorId)) return;
    if (ctx.config.mode === "hybrid") return;

    const playerNames = await ctx.getPlayersInRoom(roomId);
    const inRoom = [...playerNames.keys()];

    let round = await getOpenRound(roomId);
    if (!round) {
      round = await openRound(
        roomId,
        ctx.getSessionId() ?? "no-session",
        inRoom,
        playerNames,
        ctx.config.roundTimeoutSeconds,
      );
    }

    const sayText = `${_actorName} says: "${message}"`;
    const { round: updated, allReady } = await addPose(
      roomId,
      actorId,
      sayText,
    );
    if (!updated) return;

    if (allReady) {
      await adjudicateRound(ctx, updated.id, roomId);
    }
  });

  // ── player:move ──────────────────────────────────────────────────────────────
  // Page entering player with scene + recent activity summary.

  gameHooks.on("player:move", async (e) => {
    const { actorId, actorName, toRoomId } = e;

    if (!ctx.config.watchedRooms.includes(toRoomId)) return;
    if (ctx.config.ignoredPlayers.includes(actorId)) return;
    if (!ctx.config.autoframe) return;

    const playerNames = await ctx.getPlayersInRoom(toRoomId);
    const inRoom = [...playerNames.keys()];
    const opts = await buildInjectOpts(ctx, toRoomId, inRoom);

    // Also add the entering player to the round if one is open
    const round = await getOpenRound(toRoomId);
    if (round && ctx.config.lateJoins === "include") {
      // Will be picked up next time they pose; no forced contribution needed
    }

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

    // Invalidate cache entries that depend on room occupancy (characters)
    sessionCache.invalidate("characters");
  });

  // ── player:login ─────────────────────────────────────────────────────────────

  gameHooks.on("player:login", async (e) => {
    if (!ctx.config.greet) return;
    if (ctx.config.ignoredPlayers.includes(e.actorId)) return;

    // Brief session state greeting — just a page, no full graph needed
    const sessionId = ctx.getSessionId();
    if (!sessionId) {
      ctx.page(
        e.actorId,
        "[GM] No active session. Staff: use +gm/session/open to start one.",
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
  });

  // ── player:logout ─────────────────────────────────────────────────────────────

  gameHooks.on("player:logout", (_e) => {
    // Invalidate character cache since occupancy may have changed
    sessionCache.invalidate("characters");
  });

  // ── scene:created ─────────────────────────────────────────────────────────────
  // Log new scene opens. No round management needed -- rounds are room-scoped
  // and will open naturally when the first pose arrives.

  gameHooks.on("scene:created", (e) => {
    if (!ctx.config.watchedRooms.includes(e.roomId)) return;
    console.log(
      `[GM] Scene created: "${e.sceneName}" (${e.sceneId}) in room ${e.roomId} by ${e.actorName}.`,
    );
  });

  // ── scene:pose ────────────────────────────────────────────────────────────────
  // Treat scene poses (type="pose") as round contributions, same as player:pose.
  // OOC comments and scene-set entries are skipped here.

  gameHooks.on("scene:pose", async (e) => {
    const { actorId, actorName: _actorName, roomId, msg, type } =
      e as unknown as {
        actorId: string;
        actorName: string;
        roomId: string;
        msg: string;
        type: string;
      };

    if (type !== "pose") return; // ooc and set are handled elsewhere
    if (!ctx.config.watchedRooms.includes(roomId)) return;
    if (ctx.config.ignoredPlayers.includes(actorId)) return;
    if (ctx.config.mode === "hybrid") return;

    const playerNames = await ctx.getPlayersInRoom(roomId);
    const inRoom = [...playerNames.keys()];

    let round = await getOpenRound(roomId);
    if (!round) {
      round = await openRound(
        roomId,
        ctx.getSessionId() ?? "no-session",
        inRoom,
        playerNames,
        ctx.config.roundTimeoutSeconds,
      );
    }

    const { round: updated, allReady } = await addPose(roomId, actorId, msg);
    if (!updated) return;

    if (allReady) {
      await adjudicateRound(ctx, updated.id, roomId);
    }
  });

  // ── scene:set ─────────────────────────────────────────────────────────────────
  // When a player posts a scene-set description, the GM drafts a narration and
  // pages it privately to the staff member. They can edit and broadcast it with
  // +gm/scene/publish.

  gameHooks.on("scene:set", async (e) => {
    const { actorId, actorName, roomId, description } = e as unknown as {
      actorId: string;
      actorName: string;
      roomId: string;
      description: string;
    };

    if (!ctx.config.watchedRooms.includes(roomId)) return;

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
        `[GM DRAFT] Review and edit, then use +gm/scene/publish to broadcast:\n\n${draft}`,
      );
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
        if (!ctx.config.watchedRooms.includes(round.roomId)) continue;
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
  gh.on("gm:system:register", (event: unknown) => {
    const { system } = event as ISrSystemRegisterEvent;
    if (!system?.id) return;
    try {
      // registerGameSystem accepts IGameSystem; ingested systems pass Zod
      // validation inside deserializeSystem() which is called by loadCustomSystems.
      // Here we call it directly with the runtime object — functions are re-built
      // by the store from the serialized fields, so this is structurally safe.
      // deno-lint-ignore no-explicit-any
      registerGameSystem(system as any);
      // If the system specifies its own character collection, point the cache at it.
      const charCollection = (system as Record<string, unknown>).charCollection;
      if (typeof charCollection === "string" && charCollection) {
        sessionCache.setCharCollection(charCollection);
        console.log(
          `[GM] Character collection switched to "${charCollection}" for system "${system.id}".`,
        );
      }
      console.log(
        `[GM] Game system "${system.id}" registered via gm:system:register.`,
      );
    } catch (e: unknown) {
      console.error("[GM] gm:system:register failed:", e);
    }
  });

  // ── shadowrun:roll ────────────────────────────────────────────────────────────
  // Shadowrun plugin emits this after every +roll / +roll/edge.
  // Inject the result as a note on the roller's round contribution so the
  // GM LLM sees the mechanical outcome when it adjudicates the round.
  // If no round is open, store as a gmExchange so it appears in recentExchanges.

  gh.on("shadowrun:roll", async (event: unknown) => {
    const e = event as ISrRollEvent;
    if (!ctx.config.watchedRooms.includes(e.roomId)) return;

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
