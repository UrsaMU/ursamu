/**
 * SoftcodeService — public singleton for evaluating MUX softcode attributes.
 *
 * Mirrors SandboxService in architecture:
 * - Spawns a short-lived Deno Worker per evaluation
 * - Handles db: round-trip requests from the worker
 * - Dispatches send/roomcast/broadcast output messages to game services
 * - Enforces a 100ms wall-clock timeout (SoftcodeTimeoutError on breach)
 *
 * Usage:
 *   const result = await softcodeService.runSoftcode(code, {
 *     actorId:    actor.id,
 *     executorId: executor.id,
 *     args:       ["arg0", "arg1"],
 *   });
 */

import type { ISandboxConfig } from "../../@types/ISandboxConfig.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import { wsService } from "../WebSocket/index.ts";
import { runInWorker } from "../Sandbox/workerRunner.ts";

// ── Public context shape ──────────────────────────────────────────────────

export interface SoftcodeContext {
  /** Enactor — the player/object whose action triggered this chain (%#, %N). */
  actorId:    string;
  /** Executor — the object whose attribute is currently running (%!). */
  executorId?: string;
  /** Caller — the object that invoked u(), or null for top-level. */
  callerId?:   string | null;
  /** Positional args passed via @trigger or u() (%0–%9). */
  args?:       string[];
  /** Pre-populated registers (%q0–%qz). */
  registers?:  [string, string][];
  /** Socket id of the enactor's connection (for send() routing). */
  socketId?:   string;
}

// ── Errors ────────────────────────────────────────────────────────────────

export class SoftcodeTimeoutError extends Error {
  constructor() { super("Softcode evaluation timed out (>100ms)"); }
}

// ── Internal helpers ──────────────────────────────────────────────────────

const WORKER_URL = new URL("./softcode-worker.ts", import.meta.url).href;

/** Hydrate a raw IDBOBJ into the IDBObj shape the worker expects. */
function hydrateObj(raw: IDBOBJ): IDBObj {
  return {
    id:       raw.id,
    name:     raw.data?.name ?? "Unknown",
    flags:    new Set(raw.flags.split(" ").filter(Boolean)),
    location: raw.location,
    state:    raw.data ?? {},
    contents: [],
  };
}

/** Serialise an IDBObj to the plain-object shape (Sets aren't structured-clone safe). */
function serializeObj(obj: IDBObj): Record<string, unknown> {
  return {
    id:       obj.id,
    name:     obj.name,
    flags:    [...obj.flags],
    location: obj.location,
    state:    obj.state,
    contents: [],
  };
}

// ── SoftcodeService ───────────────────────────────────────────────────────

export class SoftcodeService {
  private static _instance: SoftcodeService;

  static getInstance(): SoftcodeService {
    if (!SoftcodeService._instance) {
      SoftcodeService._instance = new SoftcodeService();
    }
    return SoftcodeService._instance;
  }

  /**
   * Parse and evaluate a MUX softcode attribute value.
   *
   * @param code     Raw attribute value (softcode string).
   * @param context  Evaluation context (actor, executor, args, etc.).
   * @param config   Optional config — currently unused; reserved for timeout override.
   * @returns        Evaluated string result.
   */
  async runSoftcode(
    code:     string,
    context:  SoftcodeContext,
    _config?: ISandboxConfig,
  ): Promise<string> {
    const { dbojs } = await import("../Database/index.ts");

    // ── Resolve DB objects ───────────────────────────────────────────────
    const actorRaw    = await dbojs.queryOne({ id: context.actorId });
    const executorRaw = context.executorId
      ? await dbojs.queryOne({ id: context.executorId })
      : actorRaw;
    const callerRaw   = context.callerId
      ? await dbojs.queryOne({ id: context.callerId })
      : null;

    if (!actorRaw || !executorRaw) {
      throw new Error(`SoftcodeService: actor/executor not found (actorId=${context.actorId})`);
    }

    const actor    = hydrateObj(actorRaw as unknown as IDBOBJ);
    const executor = hydrateObj(executorRaw as unknown as IDBOBJ);
    const caller   = callerRaw ? hydrateObj(callerRaw as unknown as IDBOBJ) : null;

    // ── Spawn worker via shared lifecycle ────────────────────────────────
    const msgId    = crypto.randomUUID();
    const socketId = context.socketId;

    return runInWorker<string>(
      new URL(WORKER_URL),
      {
        type:    "run",
        msgId,
        code,
        context: {
          actor:     serializeObj(actor),
          executor:  serializeObj(executor),
          caller:    caller ? serializeObj(caller) : null,
          args:      context.args ?? [],
          registers: context.registers ?? [],
        },
      },
      async (msg, worker, resolve, reject) => {
        switch (msg.type as string) {
          case "result":
            resolve(msg.value as string);
            return;

          case "error":
            reject(new Error(msg.message as string));
            return;

          case "send": {
            const message  = msg.message as string;
            const targetId = msg.targetId as string | undefined;
            if (message.startsWith("\x00cemit\x00")) {
              const parts = message.split("\x00");
              await this._dispatchChanEmit(parts[2] ?? "", parts[3] ?? "");
              return;
            }
            if (targetId) {
              const sock = wsService.getConnectedSockets().find(s => s.cid === targetId);
              if (sock) broadcastSend([sock.id], message, {});
            } else if (socketId) {
              broadcastSend([socketId], message, {});
            }
            return;
          }

          case "roomcast": {
            const { dbojs: db } = await import("../Database/index.ts");
            const players = await db.query({
              $and: [{ location: msg.room as string }, { flags: /connected/i }],
            });
            const targets = players
              .filter(p => p.id !== (msg.exclude as string | undefined))
              .map(p => p.id);
            if (targets.length > 0) broadcastSend(targets, msg.message as string, {});
            return;
          }

          case "broadcast":
            broadcastAll(msg.message as string, {});
            return;

          case "db:query":
            this._handleDbQuery(worker, msg).catch(err =>
              worker.postMessage({
                type: "db:error", msgId: msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              }),
            );
            return;
        }
      },
      150, // 150ms wall-clock (worker enforces 100ms internally)
    );
  }

  // ── DB query handler (main-thread side of db:query round-trips) ──────────

  private async _handleDbQuery(
    worker: Worker,
    msg:    Record<string, unknown>,
  ): Promise<void> {
    const { dbojs: db } = await import("../Database/index.ts");
    const { msgId } = msg;

    const respond = (data: unknown) =>
      worker.postMessage({ type: "db:response", msgId, data });

    const IDBOBJ_to_IDBObj = (raw: IDBOBJ): IDBObj => hydrateObj(raw);

    switch (msg.op as string) {
      case "queryById": {
        const raw = await db.queryOne({ id: msg.id as string });
        respond(raw ? IDBOBJ_to_IDBObj(raw as unknown as IDBOBJ) : null);
        break;
      }
      case "queryByName": {
        const name = (msg.name as string).toLowerCase();
        const all  = await db.query({ flags: /connected/i });
        const found = all.find(p => (p.data?.name ?? "").toLowerCase() === name);
        respond(found ? IDBOBJ_to_IDBObj(found as unknown as IDBOBJ) : null);
        break;
      }
      case "lcon": {
        const contents = await db.query({ location: msg.locId as string });
        respond(contents.map(o => IDBOBJ_to_IDBObj(o as unknown as IDBOBJ)));
        break;
      }
      case "lwho": {
        const players = await db.query({ flags: /connected/i });
        respond(players.map(o => IDBOBJ_to_IDBObj(o as unknown as IDBOBJ)));
        break;
      }
      case "lattr": {
        const raw = await db.queryOne({ id: msg.objId as string });
        if (!raw) { respond([]); break; }
        const attrs: string[] = Object.keys((raw.data as Record<string, unknown>) ?? {})
          .filter(k => typeof (raw.data as Record<string, unknown>)[k] === "string")
          .map(k => k.toUpperCase());
        respond(attrs);
        break;
      }
      case "getAttribute": {
        const raw = await db.queryOne({ id: msg.objId as string });
        if (!raw) { respond(null); break; }
        const val = (raw.data as Record<string, unknown>)?.[
          (msg.attrName as string).toLowerCase()
        ];
        respond(typeof val === "string" ? val : null);
        break;
      }
      case "getTagById": {
        const dbMod = await import("../Database/index.ts") as Record<string, unknown>;
        const serverTags = dbMod["serverTags"] as {
          queryOne: (q: Record<string, unknown>) => Promise<{ id: string; objectId: string; name: string } | null>;
          find:     (q: Record<string, unknown>) => Promise<{ id: string; name: string }[]>;
        } | undefined;
        if (!serverTags) { respond(null); break; }

        // Sentinel: "listtags" scan
        if (msg.tagName === "__listtags__") {
          const all = await serverTags.find({});
          respond(all.map(t => t.name).join(",") || null);
          break;
        }

        const tag = await serverTags.queryOne({ id: msg.tagName as string });
        respond(tag?.objectId ?? null);
        break;
      }
      case "getPlayerTagById": {
        const dbMod = await import("../Database/index.ts") as Record<string, unknown>;
        const playerTags = dbMod["playerTags"] as {
          queryOne: (q: Record<string, unknown>) => Promise<{ id: string; objectId: string; name: string } | null>;
          find:     (q: Record<string, unknown>) => Promise<{ id: string; name: string; ownerId: string }[]>;
        } | undefined;
        if (!playerTags) { respond(null); break; }

        // Sentinel: "listltags" scan for a specific owner
        if (msg.tagName === "__listltags__") {
          const all = await playerTags.find({ ownerId: msg.actorId as string });
          respond(all.map(t => t.name).join(",") || null);
          break;
        }

        const ltag = await playerTags.queryOne({
          id: `${msg.actorId as string}:${msg.tagName as string}`,
        });
        respond(ltag?.objectId ?? null);
        break;
      }
      case "lsearch": {
        const opts = msg.opts as {
          type?: string; owner?: string; flags?: string; attr?: string; attrVal?: string;
        };
        const all = await db.query({});
        const results: string[] = [];
        for (const o of all) {
          if (opts.type) {
            const flags = ((o.flags ?? "") as string).split(" ").map((f: string) => f.toLowerCase());
            if (opts.type === "PLAYER" && !flags.includes("player")) continue;
            if (opts.type === "ROOM"   && !flags.includes("room"))   continue;
            if (opts.type === "EXIT"   && !flags.includes("exit"))   continue;
            if (opts.type === "THING"  && (flags.includes("player") || flags.includes("room") || flags.includes("exit"))) continue;
          }
          if (opts.owner) {
            const ownerId = (o.data as Record<string,unknown>)?.owner as string | undefined;
            if (ownerId !== opts.owner) continue;
          }
          if (opts.flags) {
            const objFlags = ((o.flags ?? "") as string).split(" ").map((f: string) => f.toLowerCase());
            const wantFlag = opts.flags.toLowerCase();
            if (!objFlags.includes(wantFlag)) continue;
          }
          if (opts.attr) {
            const val = (o.data as Record<string,unknown>)?.[opts.attr.toLowerCase()] as string | undefined;
            if (!val) continue;
            if (opts.attrVal && val !== opts.attrVal) continue;
          }
          results.push(`#${o.id}`);
        }
        respond(results);
        break;
      }
      case "children": {
        const parentId = msg.parentId as string;
        const all = await db.query({});
        const kids = all.filter(o => {
          const p = (o.data as Record<string,unknown>)?.parent as string | undefined;
          return p === parentId;
        }).map(o => IDBOBJ_to_IDBObj(o as unknown as IDBOBJ));
        respond(kids);
        break;
      }
      case "lchannels": {
        const dbMod = await import("../Database/index.ts") as Record<string,unknown>;
        const channels = dbMod["channels"] as { find: (q: Record<string,unknown>) => Promise<Array<{name: string}>> } | undefined;
        if (!channels) { respond(""); break; }
        const list = await channels.find({});
        respond(list.map((c: {name:string}) => c.name).join(" "));
        break;
      }
      case "channelsFor": {
        const pid = msg.playerId as string;
        const player = await db.queryOne({ id: pid });
        if (!player) { respond(""); break; }
        const chans = (player.data as Record<string,unknown>)?.channels as string[] ?? [];
        respond(chans.join(" "));
        break;
      }
      case "mailCount": {
        const pid = msg.playerId as string;
        const dbMod = await import("../Database/index.ts") as Record<string,unknown>;
        const mail = dbMod["mail"] as { find: (q: Record<string,unknown>) => Promise<Array<unknown>> } | undefined;
        if (!mail) { respond(0); break; }
        try {
          const msgs = await mail.find({ recipientId: pid, read: false });
          respond(msgs.length);
        } catch { respond(0); }
        break;
      }
      case "queueLength": {
        // Scan queue entries for this executor
        try {
          const { queue } = await import("../Queue/index.ts") as { queue: { list?: (id: string) => Promise<unknown[]> } };
          if (queue.list) {
            const entries = await queue.list(msg.executorId as string);
            respond(entries.length);
          } else {
            respond(0);
          }
        } catch { respond(0); }
        break;
      }
      case "getIdleSecs": {
        const pid = msg.playerId as string;
        const secs = wsService.getIdleSecs(pid);
        // -1 = not connected → 999999 (TinyMUX convention for offline/infinite idle)
        respond(secs < 0 ? 999999 : secs);
        break;
      }
      case "getUserFn": {
        const dbMod = await import("../Database/index.ts") as Record<string, unknown>;
        const userFuncs = dbMod["userFuncs"] as {
          findOne: (q: Record<string, unknown>) => Promise<{ code: string } | undefined>;
        } | undefined;
        if (!userFuncs) { respond(null); break; }
        try {
          const fn = await userFuncs.findOne({ id: (msg.name as string).toLowerCase() });
          respond(fn?.code ?? null);
        } catch { respond(null); }
        break;
      }
      default:
        worker.postMessage({
          type:    "db:error",
          msgId,
          message: `Unknown db op: ${msg.op}`,
        });
    }
  }

  // ── Channel emit dispatch ─────────────────────────────────────────────────

  private async _dispatchChanEmit(channel: string, message: string): Promise<void> {
    const { dbojs: db } = await import("../Database/index.ts");
    // Find all players subscribed to this channel and send them the message.
    const players = await db.query({ flags: /connected/i });
    for (const p of players) {
      const chans: string[] = (p.data as Record<string, unknown>)?.channels as string[] ?? [];
      if (chans.some(c => c.toLowerCase() === channel.toLowerCase())) {
        const sock = wsService.getConnectedSockets().find(s => s.cid === p.id);
        if (sock) broadcastSend([sock.id], message, {});
      }
    }
  }
}

export const softcodeService = SoftcodeService.getInstance();

// Re-export types consumed by other modules.
export type { EvalContext, DbAccessor, OutputAccessor } from "./context.ts";
export * from "./types.ts";
