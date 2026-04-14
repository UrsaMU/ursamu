/**
 * @module sandbox-handlers-exec
 *
 * Handles worker messages for command execution and softcode evaluation:
 *   execute, force, force:as
 *   eval:attr, eval:string
 */
import type { SDKContext } from "./SDKService.ts";
import { wsService } from "../WebSocket/index.ts";
import { send as broadcastSend, broadcast as broadcastAll } from "../broadcast/index.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";

type Msg    = Record<string, unknown>;
type Worker = globalThis.Worker;

function respond(worker: Worker, msgId: unknown, data: unknown): void {
  worker.postMessage({ type: "response", msgId, data });
}

async function resolveSocket(context: SDKContext | undefined) {
  const { wsService: ws } = await import("../WebSocket/index.ts");
  let actorId = context?.id && context.id !== "#-1" ? context.id as string : undefined;
  if (!actorId && context?.socketId) {
    const live = ws.getConnectedSockets().find(s => s.id === context.socketId);
    if (live?.cid) actorId = live.cid;
  }
  return actorId;
}

export async function handleForceMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "execute" || type === "force") {
    if (!msg.command) { respond(worker, msgId, null); return; }
    const { force }     = await import("../commands/index.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const actorId = await resolveSocket(context);
    const en = actorId ? await db.queryOne({ id: actorId }) : undefined;
    if (en) {
      const socket  = wsService.getConnectedSockets().find(s => s.cid === en.id);
      const mockCtx = {
        socket: socket || { cid: en.id, id: `script-${en.id}`, join: () => {}, leave: () => {}, send: () => {} },
        msg: msg.command as string,
      };
      // deno-lint-ignore no-explicit-any
      await force(mockCtx as any, msg.command as string);
    }
    respond(worker, msgId, null);
    return;
  }

  if (type === "force:as") {
    if (!msg.targetId || !msg.command) { respond(worker, msgId, null); return; }
    const { force }     = await import("../commands/index.ts");
    const { dbojs: db } = await import("../Database/index.ts");
    const en = await db.queryOne({ id: msg.targetId as string });
    if (en) {
      const socket  = wsService.getConnectedSockets().find(s => s.cid === en.id);
      const mockCtx = {
        socket: socket || {
          cid: en.id, id: `force-${en.id}`,
          join: () => {}, leave: () => {}, send: () => {}, disconnect: () => {},
        },
        msg: msg.command as string,
      };
      // deno-lint-ignore no-explicit-any
      await force(mockCtx as any, msg.command as string);
    }
    respond(worker, msgId, null);
    return;
  }
}

export async function handleEvalMessage(
  msg:     Msg,
  worker:  Worker,
  context: SDKContext | undefined,
): Promise<void> {
  const { type, msgId } = msg;

  if (type === "eval:attr") {
    const { dbojs: db } = await import("../Database/index.ts");
    // deno-lint-ignore no-explicit-any
    let tarObj: any = await db.queryOne({ id: msg.targetStr as string });
    if (!tarObj) {
      tarObj = await db.queryOne({
        "data.name": new RegExp(`^${String(msg.targetStr).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i"),
      });
    }
    if (!tarObj) { respond(worker, msgId, ""); return; }

    const attrs    = ((tarObj.data?.attributes as Array<{ name: string; value: string; type?: string }>) || []);
    const attrData = attrs.find((a: { name: string }) => a.name.toUpperCase() === String(msg.attr).toUpperCase());
    if (!attrData) { respond(worker, msgId, ""); return; }

    const { isSoftcode } = await import("../../utils/isSoftcode.ts");
    const evalArgs = (msg.args as string[]) || [];
    let result: string;

    if (isSoftcode(attrData)) {
      const { softcodeService } = await import("../Softcode/index.ts");
      result = await softcodeService.runSoftcode(attrData.value, {
        actorId:    String(context?.id || tarObj.id),
        executorId: tarObj.id,
        args:       evalArgs,
        socketId:   context?.socketId as string | undefined,
      });
    } else if (attrData.type === "attribute") {
      const { sandboxService } = await import("./SandboxService.ts");
      const raw = await sandboxService.runScript(attrData.value, {
        id:    tarObj.id,
        state: (tarObj.data?.state as Record<string, unknown>) || {},
        cmd:   { name: "", args: evalArgs },
      });
      result = raw != null ? String(raw) : "";
    } else {
      result = attrData.value;
    }
    respond(worker, msgId, result);
    return;
  }

  if (type === "eval:string") {
    const code = String(msg.code || "");
    if (!code) { respond(worker, msgId, ""); return; }
    try {
      const { parse }    = await import("../Softcode/parser.ts");
      const { evaluate } = await import("../Softcode/evaluator.ts");
      await import("../Softcode/stdlib/index.ts");

      const me = context?.me as { id?: string; name?: string; flags?: unknown; location?: string; state?: Record<string, unknown> } | undefined;
      const actorFlags: Set<string> = me?.flags instanceof Set
        ? (me.flags as Set<string>)
        : new Set<string>(Array.isArray(me?.flags) ? (me.flags as string[]) : []);
      const actor: IDBObj = {
        id:       me?.id ?? String(context?.id ?? "0"),
        name:     me?.name ?? "Unknown",
        flags:    actorFlags,
        location: me?.location,
        state:    me?.state ?? {},
        contents: [],
      };

      const { dbojs: _db } = await import("../Database/index.ts");
      const hydrateRaw = (r: { id: string; flags?: unknown; location?: string; data?: Record<string, unknown> }): IDBObj => ({
        id:       r.id,
        name:     (r.data?.name as string) ?? "Unknown",
        flags:    new Set(String(r.flags ?? "").split(" ").filter(Boolean)),
        location: r.location,
        state:    r.data ?? {},
        contents: [],
      });

      // deno-lint-ignore no-explicit-any
      const evalCtx: any = {
        actor, executor: actor, caller: null, args: [], registers: new Map<string, string>(),
        iterStack: [], depth: 0, deadline: Date.now() + 2000,
        db: {
          queryById:        async (id: string) => { const r = await _db.queryOne({ id }); return r ? hydrateRaw(r as Parameters<typeof hydrateRaw>[0]) : null; },
          queryByName:      async (name: string) => { const all = await _db.query({ flags: /connected/i }); const f = all.find(p => ((p.data?.name as string) ?? "").toLowerCase() === name.toLowerCase()); return f ? hydrateRaw(f as Parameters<typeof hydrateRaw>[0]) : null; },
          lcon:             async (locId: string) => { const r = await _db.query({ location: locId }); return r.map(o => hydrateRaw(o as Parameters<typeof hydrateRaw>[0])); },
          lwho:             async () => { const r = await _db.query({ flags: /connected/i }); return r.map(o => hydrateRaw(o as Parameters<typeof hydrateRaw>[0])); },
          lattr:            async (objId: string) => { const r = await _db.queryOne({ id: objId }); if (!r) return []; return Object.keys(r.data ?? {}).filter(k => typeof (r.data as Record<string, unknown>)[k] === "string").map(k => k.toUpperCase()); },
          getAttribute:     async (obj: IDBObj, attrName: string) => { const r = await _db.queryOne({ id: obj.id }); if (!r) return null; const v = (r.data ?? {})[attrName.toLowerCase()]; return typeof v === "string" ? v : null; },
          getTagById: () => Promise.resolve(null), getPlayerTagById: () => Promise.resolve(null),
          lsearch: () => Promise.resolve([]), children: () => Promise.resolve([]),
          lchannels: () => Promise.resolve(""), channelsFor: () => Promise.resolve(""),
          mailCount: () => Promise.resolve(0), queueLength: () => Promise.resolve(0),
          getIdleSecs: () => Promise.resolve(0), getUserFn: () => Promise.resolve(null),
        },
        output: {
          send: (outMsg: string, targetId?: string) => {
            const targets = targetId
              ? wsService.getConnectedSockets().filter(s => s.cid === targetId).map(s => s.id)
              : (context?.socketId ? [context.socketId as string] : []);
            if (targets.length) broadcastSend(targets, outMsg, {});
          },
          roomBroadcast: (_m: string, _r: string, _ex?: string) => {},
          broadcast: (outMsg: string) => broadcastAll(outMsg, {}),
        },
      };

      // deno-lint-ignore no-explicit-any
      const ast    = parse(code, { startRule: "Start" }) as any;
      const result = await evaluate(ast, evalCtx);
      respond(worker, msgId, result ?? code);
    } catch (_err) {
      console.error("[SandboxHandlers eval:string]", _err);
      respond(worker, msgId, code);
    }
    return;
  }
}
