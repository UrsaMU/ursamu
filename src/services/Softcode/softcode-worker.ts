/// <reference no-default-lib="true" />
/// <reference lib="deno.worker" />
/**
 * Softcode worker — runs in a dedicated Deno Worker per evaluation.
 *
 * Message protocol (main → worker):
 *   { type: "run", msgId: string, code: string, context: SerializedContext }
 *
 * Message protocol (worker → main):
 *   { type: "result",   msgId, value: string }
 *   { type: "error",    msgId, message: string }
 *   { type: "send",     message: string, targetId?: string }       ← pemit
 *   { type: "roomcast", message: string, room: string, exclude?: string } ← remit/oemit
 *   { type: "broadcast",message: string }                          ← emit / cemit
 *   { type: "db:query", msgId: string, op: string, ...params }    ← DbAccessor requests
 *
 * DB request/response (round-trip):
 *   worker → main: { type: "db:query", msgId, op, ...params }
 *   main → worker: { type: "db:response", msgId, data }
 *   main → worker: { type: "db:error",    msgId, message }
 */

import { parse }    from "./parser.ts";
import { evaluate } from "./evaluator.ts";
import type { EvalContext, DbAccessor, OutputAccessor } from "./context.ts";
import type { IDBObj } from "../../@types/UrsamuSDK.ts";

// Import all stdlib modules (side-effect registrations).
import "./stdlib/index.ts";

// ── Serialised context shape sent by SoftcodeService ─────────────────────

interface SerializedDBObj {
  id: string;
  name: string;
  flags: string[];
  location?: string;
  state?: Record<string, unknown>;
  contents?: SerializedDBObj[];
}

interface SerializedContext {
  actor:    SerializedDBObj;
  executor: SerializedDBObj;
  caller:   SerializedDBObj | null;
  args:     string[];
  registers?: [string, string][];
}

// ── Helpers ───────────────────────────────────────────────────────────────

function deserializeObj(s: SerializedDBObj): IDBObj {
  return {
    id:       s.id,
    name:     s.name,
    flags:    new Set(s.flags),
    location: s.location,
    state:    s.state ?? {},
    contents: (s.contents ?? []).map(deserializeObj),
  };
}

// ── Pending db request callbacks ──────────────────────────────────────────

const pendingDbRequests = new Map<string, {
  resolve: (v: unknown) => void;
  reject:  (e: unknown) => void;
}>();

let _msgCounter = 0;
function nextMsgId(): string { return `dw-${++_msgCounter}`; }

function dbRequest<T>(op: string, params: Record<string, unknown>): Promise<T> {
  return new Promise((resolve, reject) => {
    const msgId = nextMsgId();
    pendingDbRequests.set(msgId, { resolve: resolve as (v: unknown) => void, reject });
    self.postMessage({ type: "db:query", msgId, op, ...params });
  });
}

// ── DbAccessor implementation (posts to main thread) ─────────────────────

function makeDbAccessor(): DbAccessor {
  return {
    queryById:    (id)      => dbRequest<IDBObj | null>("queryById",    { id }),
    queryByName:  (name)    => dbRequest<IDBObj | null>("queryByName",  { name }),
    lcon:         (locId)   => dbRequest<IDBObj[]>     ("lcon",         { locId }),
    lwho:         ()        => dbRequest<IDBObj[]>     ("lwho",         {}),
    lattr:        (objId)   => dbRequest<string[]>     ("lattr",        { objId }),
    getAttribute: (obj, attrName) =>
      dbRequest<string | null>("getAttribute", { objId: obj.id, attrName }),
    getTagById:   (tagName) => dbRequest<string | null>("getTagById",   { tagName }),
    getPlayerTagById: (actorId, tagName) =>
      dbRequest<string | null>("getPlayerTagById", { actorId, tagName }),
    lsearch:      (opts)    => dbRequest<string[]>     ("lsearch",      { opts }),
    children:     (pid)     => dbRequest<IDBObj[]>     ("children",     { parentId: pid }),
    lchannels:    ()        => dbRequest<string>       ("lchannels",    {}),
    channelsFor:  (pid)     => dbRequest<string>       ("channelsFor",  { playerId: pid }),
    mailCount:    (pid)     => dbRequest<number>       ("mailCount",    { playerId: pid }),
    queueLength:  (eid)     => dbRequest<number>       ("queueLength",  { executorId: eid }),
    getIdleSecs:  (pid)     => dbRequest<number>       ("getIdleSecs",  { playerId: pid }),
    getUserFn:    (name)    => dbRequest<string | null>("getUserFn",    { name }),
  };
}

// ── OutputAccessor implementation (fire-and-forget postMessage) ───────────

function makeOutputAccessor(): OutputAccessor {
  return {
    send(message, targetId) {
      self.postMessage({ type: "send", message, targetId });
    },
    roomBroadcast(message, roomId, excludeId) {
      self.postMessage({ type: "roomcast", message, room: roomId, exclude: excludeId });
    },
    broadcast(message) {
      self.postMessage({ type: "broadcast", message });
    },
  };
}

// ── Main message handler ──────────────────────────────────────────────────

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as Record<string, unknown>;

  // ── db:response / db:error ────────────────────────────────────────────
  if (msg.type === "db:response" || msg.type === "db:error") {
    const cb = pendingDbRequests.get(msg.msgId as string);
    if (!cb) return;
    pendingDbRequests.delete(msg.msgId as string);
    if (msg.type === "db:error") cb.reject(new Error(msg.message as string));
    else cb.resolve(msg.data);
    return;
  }

  // ── run ───────────────────────────────────────────────────────────────
  if (msg.type !== "run") return;

  const { msgId, code, context: raw } = msg as {
    msgId:   string;
    code:    string;
    context: SerializedContext;
  };

  try {
    const ctx: EvalContext = {
      actor:     deserializeObj(raw.actor),
      executor:  deserializeObj(raw.executor),
      caller:    raw.caller ? deserializeObj(raw.caller) : null,
      args:      raw.args ?? [],
      registers: new Map(raw.registers ?? []),
      iterStack: [],
      depth:     0,
      deadline:  Date.now() + 500,
      db:        makeDbAccessor(),
      output:    makeOutputAccessor(),
    };

    const ast    = parse(code, { startRule: "Start" });
    const result = await evaluate(ast as Parameters<typeof evaluate>[0], ctx);
    self.postMessage({ type: "result", msgId, value: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    self.postMessage({ type: "error", msgId, message });
  }
};
