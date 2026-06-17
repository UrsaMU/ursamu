// ─── GM Plugin Entry Point ────────────────────────────────────────────────────
//
// Wires up commands, LangGraph graphs, hook context, and callback bridges.

// Load .env file if present — secrets (API keys, webhook secrets) must live
// in .env, never in the database or in-game commands.
import "@std/dotenv/load";

import { dbojs, mu, send } from "ursamu";

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

import { createModel, loadConfig } from "./providers.ts";
import { loadCustomSystems } from "./systems/index.ts";
import { embedText } from "./rag.ts";
import { seedBoards } from "@ursamu/bbs";
import { registerJobBuckets } from "ursamu/jobs";
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
import { gmExchanges } from "./db.ts";
import type { IGMExchange } from "./schema.ts";
import { runPoseGraph } from "./graphs/pose.ts";
import type { IInjectOptions } from "./context/injector.ts";
import { nanoid } from "./ingestion/util.ts";

// ─── Plugin ───────────────────────────────────────────────────────────────────

const gmPlugin: IPlugin = {
  name: "urban-shadows-gm",
  version: "1.0.0",
  description:
    "Urban Shadows AI Game Master -- agentic LangGraph + Gemini Flash GM assistant",

  init: async () => {
    // Bootstrap
    await loadCustomSystems();
    await seedBoards(["AI-GM"]);
    registerJobBuckets(["INGESTION", "GM-REVIEW"]);

    let config = await loadConfig();

    // Sync character collection to the live cache.
    // Priority: persisted config value → active system's declared collection → default.
    {
      const activeSystem = getSystem(config.systemId);
      const col = config.charCollection ??
        activeSystem.charCollection ??
        "server.playbooks";
      sessionCache.setCharCollection(col);
    }
    const model = createModel(config);
    const graphs = buildAllGraphs(model);

    // ── Player helpers ─────────────────────────────────────────────────────────

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
        const name = (p.data as { name?: string })?.name ?? p.id;
        map.set(p.id, name);
      }
      return map;
    }

    function page(playerId: string, message: string): void {
      try {
        send([playerId], `[GM Page] ${message}`);
      } catch (_err) {
        // Ignore send errors
      }
    }

    async function broadcast(roomId: string, message: string): Promise<void> {
      const playerMap = await getPlayersInRoom(roomId);
      if (playerMap.size) {
        const game = await mu();
        game.broadcast(message);
      }
    }

    function getSessionId(): string | null {
      return null; // resolved asynchronously in hooks; null is a safe default
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
          const freshModel = createModel(await loadConfig());
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

    // Page all GOD/WIZARD-flagged players and post to AI-GM board
    async function notifyAdmins(msg: string): Promise<void> {
      const game = await mu();
      game.broadcast(msg);
    }

    async function getAdminIds(): Promise<string[]> {
      const admins = await dbojs.query({
        $and: [{ "flags": { $regex: "GOD|WIZARD" } }, { type: "player" }],
      });
      return admins.map((a: { id: string }) => a.id);
    }

    const triggerIngestion = async () => {
      const freshConfig = await loadConfig();
      const freshModel = createModel(freshConfig);
      const adminIds = await getAdminIds();
      await runIngestionPipeline({
        model: freshModel,
        booksDir: freshConfig.booksDir,
        adminIds,
        notify: notifyAdmins,
      });
    };

    registerIngestCallback(triggerIngestion);
    registerModelFactory(() => createModel(config));

    startWatcher(async () => {
      const freshConfig = await loadConfig();
      const freshModel = createModel(freshConfig);
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
