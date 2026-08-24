// ─── GM Plugin Entry Point ────────────────────────────────────────────────────
//
// Wires up commands, LangGraph graphs, hook context, and callback bridges.

// Load .env if present — secrets must not live in the DB or softcode.
// examplePath: null skips .env.example key enforcement (CI / tests).
// Order: package-local → game cwd → sibling beltway-events (dev keys).
import { loadSync } from "@std/dotenv";
import { fromFileUrl, join } from "@std/path";
function loadEnvFile(path: string): void {
  try {
    loadSync({
      envPath: path,
      export: true,
      allowEmptyValues: true,
      examplePath: null,
    });
  } catch {
    /* missing file is fine */
  }
}
const _pkgDir = fromFileUrl(new URL(".", import.meta.url));
loadEnvFile(join(_pkgDir, ".env"));
loadEnvFile(".env");
// ../beltway-events from monorepo root (cwd is often games/<name>)
loadEnvFile(
  join(Deno.cwd(), "..", "..", "beltway-events", ".env.local"),
);
loadEnvFile(
  join(Deno.cwd(), "..", "..", "beltway-events", ".env.dev"),
);
loadEnvFile(join(Deno.cwd(), "..", "beltway-events", ".env.local"));

import { dbojs, send, sessions } from "@ursamu/mush";

// Minimal plugin descriptor — ursamu does not export IPlugin from its public API
interface IPlugin {
  name: string;
  version: string;
  description: string;
  init: () => Promise<boolean>;
  _webhookHandler?: (req: Request) => Promise<Response>;
  handleRequest?: (req: Request) => Promise<Response | null>;
}
import "./commands.ts";

import {
  createModel,
  loadConfig,
  requireModel,
} from "./providers.ts";
import { loadCustomSystems } from "./systems/index.ts";
import { embedText } from "./rag.ts";
import { seedBoards } from "@ursamu/bbs";
import { registerJobBuckets } from "@ursamu/jobs";
import { startWatcher } from "./ingestion/watcher.ts";
import { runIngestionPipeline } from "./ingestion/pipeline.ts";
import { registerIngestCallback, registerModelFactory } from "./commands.ts";
import {
  buildAllGraphs,
  runMoveGraph,
  runOracleGraph,
} from "./graphs/index.ts";
import type { OracleProbability } from "./graphs/index.ts";
import { type IHookContext, registerHooks } from "./hooks.ts";
import {
  registerGmGoCallback,
  registerMoveCallback,
  registerOracleCallback,
  registerPaymentAdapter,
  registerScenePublishCallback,
  registerSessionCloseCallback,
} from "./commands.ts";
import { createStripeAdapterFromEnv } from "./monetization/stripe/adapter.ts";
import { nullPaymentAdapter } from "./monetization/null-adapter.ts";
import { processWebhookEvent } from "./monetization/webhook.ts";
import { gmWallets } from "./monetization/db.ts";
import type { IPlayerWallet } from "./monetization/interface.ts";
import { generateJournalEntry } from "./social/journal.ts";
import { handleGmRequest } from "./api/routes.ts";
import { creditPlayer } from "./monetization/credits.ts";
import {
  discordEnabled,
  postNarration,
  postSessionEvent,
} from "./social/discord.ts";
import { checkAutoSpotlight } from "./social/spotlight.ts";
import { resolveDisplayName } from "./social/persona.ts";
import {
  buildRoundSummary,
  closeRound,
  getOpenRound,
  markRoundAdjudicating,
} from "./round-manager.ts";
import { sessionCache } from "./context/cache.ts";
import { loadRoomContext } from "./context/loader.ts";
import { getGameSystem as getSystem } from "./systems/index.ts";
import { gmExchanges, gmSessions } from "./db.ts";
import type { IGMExchange } from "./schema.ts";
import { runPoseGraph } from "./graphs/pose.ts";
import type { IInjectOptions } from "./context/injector.ts";
import { nanoid } from "./ingestion/util.ts";

// ─── Plugin ───────────────────────────────────────────────────────────────────

const gmPlugin: IPlugin = {
  name: "urban-shadows-gm",
  version: "0.2.3",
  description:
    "Urban Shadows AI Game Master -- agentic LangGraph + Gemini Flash GM assistant",

  init: async () => {
    // Bootstrap
    await loadCustomSystems();
    await seedBoards(["AI-GM"]);
    registerJobBuckets(["INGESTION", "GM-REVIEW"]);

    let config = await loadConfig();

    // Sync character collection to the live cache.
    // Priority: persisted config → active system's collection → default.
    {
      const activeSystem = getSystem(config.systemId);
      const col = config.charCollection ||
        activeSystem.charCollection ||
        "server.playbooks";
      sessionCache.setCharCollection(col);
      // If CPR is registered but config still generic, flip now
      if (
        config.systemId === "generic" &&
        getSystem("cyberpunk-red").id === "cyberpunk-red" &&
        getSystem("cyberpunk-red").name === "Cyberpunk RED"
      ) {
        // only if actually registered (not generic fallback)
        const cpr = getSystem("cyberpunk-red");
        if (cpr.charCollection === "cpr.players") {
          config = await (await import("./providers.ts")).saveConfig({
            systemId: "cyberpunk-red",
            charCollection: "cpr.players",
            persona: {
              name: "Night City",
              tone:
                "gritty cyberpunk noir, chrome and blood, Night City 2045",
              style:
                "terse, visceral, present tense, second person, " +
                "fiction-first, Cyberpunk RED core rules",
              oocBrackets: true,
            },
          });
          sessionCache.setCharCollection("cpr.players");
          console.log(
            "[GM] Boot: activated cyberpunk-red + cpr.players",
          );
        }
      }
    }
    // ── Player helpers (available even without an API key) ───────────────────

    /** core send() takes socketIds — never raw player dbrefs. */
    function socketsForActor(actorId: string): string[] {
      const id = String(actorId ?? "").replace(/^#/, "");
      if (!id) return [];
      return sessions.list()
        .filter((s) => {
          const a = String(
            (s as { actorId?: string }).actorId ??
              s.sessionId ??
              "",
          ).replace(/^#/, "");
          return a === id || a === actorId;
        })
        .map((s) => s.socketId)
        .filter(Boolean);
    }

    function socketsForActors(actorIds: string[]): string[] {
      const out = new Set<string>();
      for (const aid of actorIds) {
        for (const sid of socketsForActor(aid)) out.add(sid);
      }
      return [...out];
    }

    function isStaffFlags(flags: unknown): boolean {
      const f = flags instanceof Set
        ? [...flags].join(" ")
        : String(flags ?? "");
      return /\b(wizard|admin|superuser|god)\b/i.test(f);
    }

    async function getPlayersInRoom(
      roomId: string,
    ): Promise<Map<string, string>> {
      const players = await dbojs.query({
        $and: [
          { location: roomId },
          { flags: /connected/i },
          { flags: /player/i },
        ],
      });
      const map = new Map<string, string>();
      for (const p of players) {
        // Staff in the room should not block solo rounds
        if (isStaffFlags(p.flags)) continue;
        const name = (p.data as { name?: string })?.name ?? p.id;
        map.set(p.id, name);
      }
      return map;
    }

    function page(playerId: string, message: string): void {
      try {
        const socks = socketsForActor(playerId);
        if (!socks.length) {
          console.warn(
            `[GM] page: no socket for player ${playerId}`,
          );
          return;
        }
        send(socks, `[GM Page] ${message}`);
      } catch (err) {
        console.error("[GM] page error:", err);
      }
    }

    /**
     * Room narration — socket IDs only (never player dbrefs).
     * NEVER call mu()/initializeEngine here.
     */
    async function broadcast(
      roomId: string,
      message: string,
    ): Promise<void> {
      try {
        const playerMap = await getPlayersInRoom(roomId);
        // Also include staff so they hear GM narration
        const allHere = await dbojs.query({
          $and: [
            { location: roomId },
            { flags: /connected/i },
            { flags: /player/i },
          ],
        });
        const actorIds = [
          ...new Set([
            ...playerMap.keys(),
            ...allHere.map((p: { id: string }) => p.id),
          ]),
        ];
        const socks = socketsForActors(actorIds);
        if (!socks.length) {
          console.warn(
            `[GM] broadcast: no sockets in room ${roomId}`,
          );
          return;
        }
        const text = message.startsWith("[GM]")
          ? message
          : `[GM] ${message}`;
        send(socks, text);
        console.log(
          `[GM] broadcast → ${socks.length} socket(s) in ${roomId}`,
        );
      } catch (err) {
        console.error("[GM] broadcast error:", err);
      }
    }

    // Config / watch / session commands register at import time and do not
    // need a model. Soft-fail LLM wiring so a missing API key cannot
    // take down the whole game server.
    const model = createModel(config);
    if (!model) {
      console.warn(
        "[GM] No LLM API key — +gm/watch and config work; " +
          "set ANTHROPIC_API_KEY (or GOOGLE_API_KEY) in " +
          "games/<name>/.env or packages/ai-gm/.env.",
      );
      registerPaymentAdapter(
        createStripeAdapterFromEnv() ?? nullPaymentAdapter,
      );
      registerScenePublishCallback(async (roomId, message) => {
        await broadcast(roomId, message);
      });
      console.log("[GM] Plugin initialised (degraded — no API key).");
      return true;
    }

    const graphs = buildAllGraphs(model);

    async function getSessionId(): Promise<string | null> {
      try {
        const open = await gmSessions.queryOne(
          { status: "open" } as Parameters<
            typeof gmSessions.queryOne
          >[0],
        );
        return open?.id ?? null;
      } catch (err) {
        console.error("[GM] getSessionId error:", err);
        return null;
      }
    }

    // ── Shared IInjectOptions builder ─────────────────────────────────────────

    async function buildOpts(
      roomId: string,
      inRoomPlayerIds: string[],
      currentRound?: import("./schema.ts").IGMRound,
    ): Promise<IInjectOptions> {
      const [snapshot, lore] = await Promise.all([
        sessionCache.getSnapshot(),
        sessionCache.getLore(),
      ]);
      const recentExchanges = (
        (await gmExchanges.query(
          {
            roomId,
          } as Parameters<typeof gmExchanges.query>[0],
        )) as IGMExchange[]
      )
        .sort((a, b) => a.timestamp - b.timestamp)
        .slice(-20);

      const roomCtx = await loadRoomContext(
        roomId,
        snapshot,
        inRoomPlayerIds,
        recentExchanges.map((e) => e.input),
      );

      return {
        config,
        system: getSystem(config.systemId),
        snapshot,
        roomCtx,
        lorePages: lore,
        recentExchanges,
        graphSuffix: "",
        inRoomPlayerIds,
        currentRound,
      };
    }

    // ── Hook context ───────────────────────────────────────────────────────────

    const hookCtx: IHookContext = {
      config,
      getConfig: async () => {
        // Always re-read so +gm/watch and mode changes apply live
        config = await loadConfig();
        return config;
      },
      graphs,
      page,
      broadcast,
      getPlayersInRoom,
      getSessionId,
    };

    registerHooks(hookCtx);

    // ── +gm/go ─────────────────────────────────────────────────────────────────

    registerGmGoCallback(async (roomId: string) => {
      config = await loadConfig();
      const round = await getOpenRound(roomId);
      if (!round) return;

      await markRoundAdjudicating(round.id);
      const playerIds = round.contributions.map((c) => c.playerId);
      const opts = await buildOpts(roomId, playerIds, round);
      const roundSummary = buildRoundSummary(round);

      let output = "";
      try {
        output = await runPoseGraph(graphs.pose, { opts, roundSummary });
      } catch (e) {
        console.error("[GM] +gm/go pose graph error:", e);
        output = "[GM is temporarily unavailable.]";
      }

      if (output) await broadcast(roomId, output);
      await closeRound(round.id);

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
    });

    // ── +gm/oracle ─────────────────────────────────────────────────────────────

    registerOracleCallback(
      async (
        playerId: string,
        question: string,
        probability: string,
        roomId: string,
      ) => {
        config = await loadConfig();
        const playerMap = await getPlayersInRoom(roomId);
        const playerIds = [...playerMap.keys()];
        const opts = await buildOpts(roomId, playerIds);
        const playerName = await resolveDisplayName(
          playerId,
          playerMap.get(playerId) ?? playerId,
        );

        let output = "";
        try {
          output = await runOracleGraph(graphs.oracle, {
            opts,
            question,
            probability: probability as OracleProbability,
            playerName,
          });
        } catch (e) {
          console.error("[GM] oracle graph error:", e);
          output = "[GM oracle temporarily unavailable.]";
        }

        if (output) await broadcast(roomId, output);

        const embedding = await embedText(question + " " + output);
        await gmExchanges.create(
          {
            id: nanoid(),
            type: "oracle",
            roomId,
            playerId,
            playerName,
            input: question,
            output,
            toolsUsed: [],
            timestamp: Date.now(),
            embedding,
          },
        );
      },
    );

    // ── +gm/move ───────────────────────────────────────────────────────────────

    registerMoveCallback(
      async (
        playerId: string,
        moveName: string,
        total: number,
        roomId: string,
      ) => {
        config = await loadConfig();
        const playerMap = await getPlayersInRoom(roomId);
        const playerIds = [...playerMap.keys()];
        const opts = await buildOpts(roomId, playerIds);
        const playerName = await resolveDisplayName(
          playerId,
          playerMap.get(playerId) ?? playerId,
        );

        let output = "";
        try {
          output = await runMoveGraph(graphs.move, {
            opts,
            moveName,
            stat: "unknown",
            statValue: 0,
            roll1: 0,
            roll2: 0,
            total,
            playerName,
            triggeringPose: `+gm/move ${moveName}=${total}`,
          });
        } catch (e) {
          console.error("[GM] move graph error:", e);
          output = "[GM move adjudication temporarily unavailable.]";
        }

        if (output) await broadcast(roomId, output);

        const inputStr = `${moveName} = ${total}`;
        const embedding = await embedText(inputStr + " " + output);
        await gmExchanges.create(
          {
            id: nanoid(),
            type: "move",
            roomId,
            playerId,
            playerName,
            input: inputStr,
            output,
            toolsUsed: [],
            timestamp: Date.now(),
            embedding,
          },
        );

        // Auto-spotlight on exceptional rolls
        await checkAutoSpotlight(playerId, playerName, moveName, total);

        // Mirror narration to Discord
        if (output && discordEnabled()) await postNarration(output);
      },
    );

    // ── +gm/scene/publish ───────────────────────────────────────────────────────

    registerScenePublishCallback(async (roomId: string, message: string) => {
      await broadcast(roomId, message);
      if (discordEnabled()) await postNarration(message);
    });

    // ── Session journal generation ────────────────────────────────────────────
    // Triggered after session close: pull recent exchanges and summarize.

    registerSessionCloseCallback(
      async (sessionId: string, sessionLabel: string) => {
        if (discordEnabled()) await postSessionEvent(sessionLabel, "closed");
        try {
          const freshModel = requireModel(await loadConfig());
          const exchanges = (
            (await gmExchanges.query(
              {} as Parameters<typeof gmExchanges.query>[0],
            )) as IGMExchange[]
          ).filter((e) => e.timestamp > Date.now() - 24 * 60 * 60 * 1000); // last 24h
          if (exchanges.length) {
            const participants = [
              ...new Set(exchanges.map((e) => e.playerId).filter(Boolean)),
            ] as string[];
            await generateJournalEntry(
              freshModel,
              sessionLabel,
              sessionId,
              exchanges,
              participants,
            );
            console.log(
              `[GM] Journal entry generated for session "${sessionLabel}".`,
            );
          }
        } catch (err) {
          console.warn("[GM] Journal generation failed:", err);
        }
      },
    );

    // ── Ingestion pipeline ──────────────────────────────────────────────────────

    // Page GOD/WIZARD staff — never re-init the engine to broadcast
    async function notifyAdmins(msg: string): Promise<void> {
      try {
        const ids = await getAdminIds();
        const socks = socketsForActors(ids);
        if (socks.length) send(socks, `[GM] ${msg}`);
        else console.log(`[GM admin] ${msg}`);
      } catch (err) {
        console.error("[GM] notifyAdmins error:", err);
      }
    }

    async function getAdminIds(): Promise<string[]> {
      const admins = await dbojs.query({
        $and: [
          { "flags": { $regex: "GOD|WIZARD|wizard|admin" } },
          { flags: /player/i },
        ],
      });
      return admins.map((a: { id: string }) => a.id);
    }

    const triggerIngestion = async () => {
      const freshConfig = await loadConfig();
      const freshModel = requireModel(freshConfig);
      const adminIds = await getAdminIds();
      await runIngestionPipeline({
        model: freshModel,
        booksDir: freshConfig.booksDir,
        adminIds,
        notify: notifyAdmins,
      });
    };

    registerIngestCallback(triggerIngestion);
    registerModelFactory(() => requireModel(config));

    startWatcher(async () => {
      const freshConfig = await loadConfig();
      const freshModel = requireModel(freshConfig);
      const adminIds = await getAdminIds();
      return {
        model: freshModel,
        booksDir: freshConfig.booksDir,
        adminIds,
        notify: notifyAdmins,
      };
    });

    // ── Payment adapter ──────────────────────────────────────────────────────

    const stripeAdapter = createStripeAdapterFromEnv();
    registerPaymentAdapter(stripeAdapter ?? nullPaymentAdapter);
    if (stripeAdapter) {
      console.log("[GM] Stripe payment adapter active.");
    }

    // ── Webhook handler (wired to REST route in Phase 6 api/routes.ts) ────────
    // Exposed as a named export so the REST layer can call it without
    // duplicating the business logic here.

    gmPlugin._webhookHandler = async (req: Request): Promise<Response> => {
      const adapter = stripeAdapter;
      if (!adapter) {
        return new Response("Payment not configured", { status: 503 });
      }
      const sig = req.headers.get("stripe-signature") ?? "";
      const raw = new Uint8Array(await req.arrayBuffer());
      try {
        const event = await adapter.handleWebhook(raw, sig);
        const resolvePlayer = async (
          customerId: string,
        ): Promise<string | null> => {
          const wallets = await gmWallets.query(
            {} as Parameters<typeof gmWallets.query>[0],
          ) as IPlayerWallet[];
          return wallets.find((w) => w.subscriptionId?.startsWith(customerId))
            ?.playerId ?? null;
        };
        await processWebhookEvent(event, resolvePlayer);
        return new Response("ok", { status: 200 });
      } catch (err) {
        console.error("[GM] Webhook error:", err);
        return new Response("Webhook error", { status: 400 });
      }
    };

    // ── REST API handler (exposed for host server to route requests) ──────────
    // The host can call gmPlugin.handleRequest(req) from its Deno.serve handler.

    gmPlugin.handleRequest = (req: Request) =>
      handleGmRequest(req, {
        webhookHandler: gmPlugin._webhookHandler,
        adminCreditGrantFn: (playerId, amount) =>
          creditPlayer(playerId, amount, "admin_grant", { source: "rest-api" }),
      });

    console.log("[GM] Plugin initialised.");
    return true;
  },
};

export default gmPlugin;
