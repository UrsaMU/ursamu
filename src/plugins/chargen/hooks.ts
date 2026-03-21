import type { IChargenApp } from "./db.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import { send } from "../../services/broadcast/index.ts";
import { wsService } from "../../services/WebSocket/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { findAppByPlayer } from "./db.ts";
import { gameHooks } from "../../services/Hooks/GameHooks.ts";

// ─── hook type map ────────────────────────────────────────────────────────────

export type ChargenHookMap = {
  /** A player submitted their chargen application. */
  "chargen:submitted": (app: IChargenApp) => void | Promise<void>;
  /** A chargen application was approved. */
  "chargen:approved":  (app: IChargenApp) => void | Promise<void>;
  /** A chargen application was rejected. */
  "chargen:rejected":  (app: IChargenApp) => void | Promise<void>;
};

type HandlerList = { [K in keyof ChargenHookMap]: ChargenHookMap[K][] };

// ─── registry ─────────────────────────────────────────────────────────────────

const _handlers: HandlerList = {
  "chargen:submitted": [],
  "chargen:approved":  [],
  "chargen:rejected":  [],
};

// ─── public API ───────────────────────────────────────────────────────────────

export interface IChargenHooks {
  on<K extends keyof ChargenHookMap>(event: K, handler: ChargenHookMap[K]): void;
  off<K extends keyof ChargenHookMap>(event: K, handler: ChargenHookMap[K]): void;
  emit<K extends keyof ChargenHookMap>(event: K, ...args: Parameters<ChargenHookMap[K]>): Promise<void>;
}

export const chargenHooks: IChargenHooks = {
  on<K extends keyof ChargenHookMap>(event: K, handler: ChargenHookMap[K]): void {
    (_handlers[event] as ChargenHookMap[K][]).push(handler);
  },

  off<K extends keyof ChargenHookMap>(event: K, handler: ChargenHookMap[K]): void {
    const list = _handlers[event] as ChargenHookMap[K][];
    const idx = list.indexOf(handler);
    if (idx !== -1) list.splice(idx, 1);
  },

  async emit<K extends keyof ChargenHookMap>(
    event: K,
    ...args: Parameters<ChargenHookMap[K]>
  ): Promise<void> {
    for (const handler of [...(_handlers[event] as ((...a: Parameters<ChargenHookMap[K]>) => void | Promise<void>)[])]) {
      try {
        await (handler as (...a: Parameters<ChargenHookMap[K]>) => void | Promise<void>)(...args);
      } catch (e) {
        console.error(`[chargen] Uncaught error in hook "${event}":`, e);
      }
    }
  },
};

// ─── aconnect logic ───────────────────────────────────────────────────────────

/**
 * If the player has the "unapproved" flag, send them a reminder that
 * they haven't completed chargen. Called from the player:login game hook.
 */
export async function chargenAconnect(player: IDBOBJ): Promise<void> {
  const flags = player.flags || "";
  if (!flags.includes("unapproved")) return;

  const sockets = wsService.getConnectedSockets();
  const playerSockets = sockets.filter(s => s.cid === player.id);
  if (playerSockets.length === 0) return;

  const socketIds = playerSockets.map(s => s.id);
  const app = await findAppByPlayer(player.id);

  if (!app || app.data.status === "draft") {
    send(socketIds, "%ch>CHARGEN:%cn Welcome! You haven't completed character generation yet. Use %ch+chargen%cn to view your application and %ch+chargen/set <field>=<value>%cn to fill in your fields. Type %ch+chargen/submit%cn when ready.");
  } else if (app.data.status === "pending") {
    send(socketIds, "%ch>CHARGEN:%cn Your character application is pending staff review. You will be notified when it has been processed.");
  } else if (app.data.status === "rejected") {
    const reason = app.data.notes ? ` Reason: ${app.data.notes}` : "";
    send(socketIds, `%ch>CHARGEN:%cn Your character application was rejected.${reason} Please update your application and resubmit with %ch+chargen/submit%cn.`);
  }
}

/** Wire chargenAconnect into the game's player:login event. */
export function registerChargenHooks(): void {
  gameHooks.on("player:login", async ({ actorId }) => {
    const player = await dbojs.queryOne({ id: actorId });
    if (player) await chargenAconnect(player);
  });
}
