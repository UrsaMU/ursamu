import { gameHooks } from "@ursamu/mush";
import { runCityGraph } from "./graphs/utopia-city.ts";
import type { IGMGraphs } from "./graphs/index.ts";
import type { IGMConfig } from "./schema.ts";
import type { IInjectOptions } from "./context/injector.ts";
import type { CityNarrationKind } from "./prompts/templates.ts";

export interface IUtopiaWeekReady {
  roomId: string;
  week: number;
  city: string;
  summary: string;
  plans?: { playerId: string; playerName: string; plan: string }[];
  autoWatch?: boolean;
}

export interface IUtopiaHookCtx {
  getConfig: () => Promise<IGMConfig>;
  graphs: IGMGraphs;
  broadcast: (
    roomId: string,
    message: string,
  ) => void | Promise<void>;
  getPlayersInRoom: (roomId: string) => Promise<Map<string, string>>;
  getSessionId: () => string | null | Promise<string | null>;
  buildInjectOpts: (
    roomId: string,
    playerIds: string[],
  ) => Promise<IInjectOptions>;
}

export async function ensureWatched(
  roomId: string,
): Promise<void> {
  const { loadConfig, saveConfig } = await import("./providers.ts");
  const cfg = await loadConfig();
  if (cfg.watchedRooms.includes(roomId)) return;
  await saveConfig({
    watchedRooms: [...cfg.watchedRooms, roomId],
  });
}

export function weekRoundSummary(p: IUtopiaWeekReady): string {
  return `Room: ${p.roomId}  Status: week-ready\n` +
    (p.summary || `Week ${p.week} ${p.city}`);
}

async function speak(
  ctx: IUtopiaHookCtx,
  roomId: string,
  kind: CityNarrationKind,
  summary: string,
  playerIds: string[],
): Promise<void> {
  if (!ctx.graphs.city) return;
  const opts = await ctx.buildInjectOpts(roomId, playerIds);
  const output = await runCityGraph(ctx.graphs.city, {
    opts,
    kind,
    summary,
  });
  if (output) await ctx.broadcast(roomId, output);
}

export function registerUtopiaHooks(ctx: IUtopiaHookCtx): void {
  // deno-lint-ignore no-explicit-any
  const on = (gameHooks as any).on?.bind(gameHooks);
  if (typeof on !== "function") return;

  on("utopia:week:ready", async (raw: unknown) => {
    const p = raw as IUtopiaWeekReady;
    const roomId = String(p.roomId ?? "");
    if (!roomId) return;
    try {
      if (p.autoWatch !== false) await ensureWatched(roomId);
      const names = await ctx.getPlayersInRoom(roomId);
      const ids = p.plans?.map((x) => x.playerId) ??
        [...names.keys()];
      await speak(
        ctx,
        roomId,
        "week",
        weekRoundSummary(p),
        ids,
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[GM] utopia:week:ready:", msg);
    }
  });

  on("utopia:roll", async (raw: unknown) => {
    const p = raw as {
      roomId?: string;
      playerId?: string;
      summary?: string;
      autoWatch?: boolean;
    };
    const roomId = String(p.roomId ?? "");
    if (!roomId || !p.summary) return;
    try {
      if (p.autoWatch !== false) await ensureWatched(roomId);
      const ids = p.playerId ? [p.playerId] : [];
      await speak(ctx, roomId, "roll", p.summary, ids);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[GM] utopia:roll narrate:", msg);
    }
  });

  on("utopia:feed:ticked", async (raw: unknown) => {
    const p = raw as {
      roomId?: string;
      playerId?: string;
      summary?: string;
      autoWatch?: boolean;
    };
    const roomId = String(p.roomId ?? "");
    if (!roomId || !p.summary) return;
    try {
      if (p.autoWatch !== false) await ensureWatched(roomId);
      const ids = p.playerId ? [p.playerId] : [];
      await speak(ctx, roomId, "feed", p.summary, ids);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[GM] utopia:feed narrate:", msg);
    }
  });
}
