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

    // ── Spawn worker ─────────────────────────────────────────────────────
    const worker = new Worker(WORKER_URL, { type: "module" });
    const msgId  = crypto.randomUUID();
    const socketId = context.socketId;

    return new Promise<string>((resolve, reject) => {
      let settled = false;

      // ── Timeout guard ────────────────────────────────────────────────
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        worker.terminate();
        reject(new SoftcodeTimeoutError());
      }, 150); // 150ms wall-clock (worker enforces 100ms internally)

      // ── Message dispatcher ───────────────────────────────────────────
      worker.onmessage = async (e: MessageEvent) => {
        if (!e.data || typeof e.data.type !== "string") return;
        const msg = e.data as Record<string, unknown>;

        switch (msg.type) {
          // ── Evaluation result ────────────────────────────────────────
          case "result":
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            resolve(msg.value as string);
            return;

          // ── Evaluation error ─────────────────────────────────────────
          case "error":
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            worker.terminate();
            reject(new Error(msg.message as string));
            return;

          // ── Output: pemit ────────────────────────────────────────────
          case "send": {
            const message  = msg.message as string;
            const targetId = msg.targetId as string | undefined;

            // Detect channel emit sentinel: "\x00cemit\x00channel\x00msg"
            if (message.startsWith("\x00cemit\x00")) {
              const parts   = message.split("\x00");
              const channel = parts[2] ?? "";
              const chanMsg = parts[3] ?? "";
              await this._dispatchChanEmit(channel, chanMsg);
              return;
            }

            if (targetId) {
              // Route to the target object's socket
              const sock = wsService.getConnectedSockets().find(s => s.cid === targetId);
              const targets = sock ? [sock.id] : [];
              if (targets.length > 0) broadcastSend(targets, message, {});
            } else if (socketId) {
              broadcastSend([socketId], message, {});
            }
            return;
          }

          // ── Output: remit / oemit ────────────────────────────────────
          case "roomcast": {
            const { dbojs: db } = await import("../Database/index.ts");
            const room     = msg.room     as string;
            const message  = msg.message  as string;
            const excludeId= msg.exclude  as string | undefined;

            const players = await db.query({
              $and: [{ location: room }, { flags: /connected/i }]
            });
            const targets = players
              .filter(p => p.id !== excludeId)
              .map(p => p.id);

            if (targets.length > 0) broadcastSend(targets, message, {});
            return;
          }

          // ── Output: emit (all connected) ─────────────────────────────
          case "broadcast": {
            broadcastAll(msg.message as string, {});
            return;
          }

          // ── DB round-trip requests ────────────────────────────────────
          case "db:query":
            this._handleDbQuery(worker, msg).catch(err => {
              worker.postMessage({
                type:    "db:error",
                msgId:   msg.msgId,
                message: err instanceof Error ? err.message : String(err),
              });
            });
            return;
        }
      };

      worker.onerror = (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(`Softcode worker error: ${e.message}`));
      };

      // ── Send the run message ─────────────────────────────────────────
      worker.postMessage({
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
      });
    });
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
