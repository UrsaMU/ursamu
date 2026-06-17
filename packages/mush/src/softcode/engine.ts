// deno-lint-ignore-file require-await
/**
 * UrsaMU softcode engine — singleton EvalEngine configured for UrsaMU.
 *
 * Creates a single EvalEngine instance, registers the full stdlib from
 * @ursamu/mushcode, then overlays all UrsaMU-specific functions and
 * custom substitution handlers.
 */
import { EvalEngine, registerStdlib } from "@ursamu/mushcode/eval";
import type {
  ObjectAccessor,
  FunctionImpl,
  EvalThunk,
} from "@ursamu/mushcode/eval";
import type { UrsaEvalContext } from "./context.ts";
import {
  snapshotRegisters,
  restoreRegisters,
  toLibCtx,
} from "./context.ts";

// Import all UrsaMU stdlib modules (side-effect registrations into _registry).
import "./stdlib/index.ts";
import { entries } from "./stdlib/index.ts";
import type { StdlibFn } from "./stdlib/index.ts";

// Import subRegistry for plugin-registered substitutions.
import { lookupSub } from "./stdlib/subRegistry.ts";

// ── Bridge ObjectAccessor ─────────────────────────────────────────────────────

let _activeCtx: UrsaEvalContext | null = null;

const bridgeAccessor: ObjectAccessor = {
  async getAttr(id: string, attr: string): Promise<string | null> {
    const ctx = _activeCtx;
    if (!ctx) return null;
    const obj = await ctx.db.queryById(id);
    if (!obj) return null;
    return ctx.db.getAttribute(obj, attr.toUpperCase());
  },
  async resolveTarget(_from: string, expr: string): Promise<string | null> {
    const ctx = _activeCtx;
    if (!ctx) return null;
    const e = expr.trim().toLowerCase();
    if (e === "me")      return ctx.executor.id;
    if (e === "here")    return ctx.executor.location ?? null;
    if (e === "enactor") return ctx.enactor;
    if (/^#(-?\d+)$/.test(expr)) return expr.slice(1);
    const obj = await ctx.db.queryByName(expr);
    return obj?.id ?? null;
  },
  async getName(id: string): Promise<string> {
    const ctx = _activeCtx;
    if (!ctx) return "";
    const obj = await ctx.db.queryById(id);
    return obj?.name ?? "";
  },
  async hasFlag(id: string, flag: string): Promise<boolean> {
    const ctx = _activeCtx;
    if (!ctx) return false;
    const obj = await ctx.db.queryById(id);
    return obj?.flags.has(flag.toLowerCase()) ?? false;
  },
  async getMoniker(id: string): Promise<string | null> {
    const ctx = _activeCtx;
    if (!ctx) return null;
    const obj = await ctx.db.queryById(id);
    return (obj?.state?.moniker as string | undefined) ?? null;
  },
  async getLocation(id: string): Promise<string> {
    const ctx = _activeCtx;
    if (!ctx) return "";
    const obj = await ctx.db.queryById(id);
    return obj?.location ?? "";
  },
  async getContents(id: string): Promise<string[]> {
    const ctx = _activeCtx;
    if (!ctx) return [];
    const objs = await ctx.db.lcon(id);
    return objs.map((o) => o.id);
  },
  async getConnectedPlayers(): Promise<string[]> {
    const ctx = _activeCtx;
    if (!ctx) return [];
    const objs = await ctx.db.lwho();
    return objs.map((o) => o.id);
  },
  async getParentChain(id: string): Promise<string[]> {
    const ctx = _activeCtx;
    if (!ctx) return [id];
    const chain: string[] = [id];
    let current = id;
    for (let i = 0; i < 20; i++) {
      const obj = await ctx.db.queryById(current);
      const parentId = obj?.state?.parent as string | undefined;
      if (!parentId) break;
      chain.push(parentId);
      current = parentId;
    }
    return chain;
  },
  async findPlayer(partial: string): Promise<string | null> {
    const ctx = _activeCtx;
    if (!ctx) return null;
    const obj = await ctx.db.queryByName(partial);
    return obj?.id ?? null;
  },
  listAttrs(objectId: string): Promise<string[]> {
    const ctx = _activeCtx;
    if (!ctx) return Promise.resolve([]);
    return ctx.db.lattr(objectId);
  },
  async getType(id: string): Promise<string> {
    const ctx = _activeCtx;
    if (!ctx) return "THING";
    const obj = await ctx.db.queryById(id);
    if (!obj) return "THING";
    if (obj.flags.has("room"))   return "ROOM";
    if (obj.flags.has("exit"))   return "EXIT";
    if (obj.flags.has("player")) return "PLAYER";
    return "THING";
  },
  async findObject(_from: string, expr: string): Promise<string | null> {
    const ctx = _activeCtx;
    if (!ctx) return null;
    if (/^#(-?\d+)$/.test(expr)) return expr.slice(1);
    const obj = await ctx.db.queryByName(expr);
    return obj?.id ?? null;
  },
};

// ── Engine construction ───────────────────────────────────────────────────────

const _engine: EvalEngine = new EvalEngine(bridgeAccessor);

// Register generic stdlib (math, string, compare, logic, register, iter, db).
registerStdlib(_engine);

// ── Wrap legacy StdlibFn → FunctionImpl ──────────────────────────────────────

function wrapFn(fn: StdlibFn): FunctionImpl {
  return {
    minArgs: 0,
    maxArgs: Infinity,
    exec: (args, ctx) =>
      fn(args as string[], ctx as unknown as Parameters<StdlibFn>[1], []),
  };
}

// ── Override lazy functions with proper lazy FunctionImpl ─────────────────────

function switchWildcard(str: string, pattern: string): boolean {
  if (pattern.startsWith("<")) return parseFloat(str) < parseFloat(pattern.slice(1));
  if (pattern.startsWith(">")) return parseFloat(str) > parseFloat(pattern.slice(1));
  const re = "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".") + "$";
  return new RegExp(re, "i").test(str);
}

_engine.registerFunction("switch", {
  eval: "lazy",
  minArgs: 3,
  maxArgs: Infinity,
  async exec(args, _ctx) {
    const thunks = args as EvalThunk[];
    const str = await thunks[0]();
    for (let i = 1; i + 1 < thunks.length; i += 2) {
      const pattern = await thunks[i]();
      if (switchWildcard(str, pattern)) return await thunks[i + 1]();
    }
    if (thunks.length % 2 === 0) return await thunks[thunks.length - 1]();
    return "";
  },
});

_engine.registerFunction("localize", {
  eval: "lazy",
  minArgs: 1,
  maxArgs: 1,
  async exec(args, ctx) {
    const uctx = ctx as unknown as UrsaEvalContext;
    const snap = snapshotRegisters(uctx);
    try {
      return await (args as EvalThunk[])[0]();
    } finally {
      restoreRegisters(uctx, snap);
    }
  },
});

_engine.registerFunction("while", {
  eval: "lazy",
  minArgs: 2,
  maxArgs: 2,
  async exec(args, _ctx) {
    const thunks = args as EvalThunk[];
    const MAX = 1000;
    let result = "";
    for (let i = 0; i < MAX; i++) {
      const cond = await thunks[0]();
      if (!cond || cond === "0") break;
      result = await thunks[1]();
    }
    return result;
  },
});

// iter alias: "parse" is a TinyMUX alias for iter.
const _iterImpl = ((_engine as unknown as { functions: Map<string, FunctionImpl> }).functions).get("iter");
if (_iterImpl) {
  _engine.registerFunction("parse", _iterImpl);
}

// ── Register all UrsaMU stdlib functions ──────────────────────────────────────

const SKIP_NAMES = new Set([
  "iter", "parse", "localize", "while",
  "add", "sub", "mul", "div", "mod", "abs", "round", "floor", "ceil",
  "max", "min", "power", "sqrt",
  "strlen", "mid", "left", "right", "trim",
  "ucstr", "lcstr", "capstr", "cat",
  "eq", "neq", "gt", "gte", "lt", "lte",
  "if", "ifelse", "and", "or", "not", "t",
  "r", "setr",
  "words", "word", "first", "last", "rest",
]);

for (const [name, fn] of entries()) {
  if (!SKIP_NAMES.has(name)) {
    _engine.registerFunction(name, wrapFn(fn));
  }
}

// ── Custom substitution handlers ──────────────────────────────────────────────

_engine.registerSub("#", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return `#${uctx.actor.id}`;
});

_engine.registerSub("!", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return `#${uctx.executor.id}`;
});

_engine.registerSub("@", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return uctx.caller ? `#${uctx.caller.id}` : "#-1";
});

_engine.registerSub("N", (_code, ctx) =>
  (ctx as unknown as UrsaEvalContext).actor.name ?? "");
_engine.registerSub("n", (_code, ctx) =>
  ((ctx as unknown as UrsaEvalContext).actor.name ?? "").toLowerCase());

_engine.registerSub("L", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return uctx.actor.location ? `#${uctx.actor.location}` : "#-1";
});

type PronounSex = "male" | "female" | "neutral" | "plural";
interface PronounSet { subj: string; obj: string; poss: string; abs: string; }
const PRONOUNS: Record<PronounSex, PronounSet> = {
  male:    { subj: "he",   obj: "him",  poss: "his",   abs: "his"    },
  female:  { subj: "she",  obj: "her",  poss: "her",   abs: "hers"   },
  neutral: { subj: "it",   obj: "it",   poss: "its",   abs: "its"    },
  plural:  { subj: "they", obj: "them", poss: "their", abs: "theirs" },
};
function cap(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }
async function getSex(ctx: UrsaEvalContext): Promise<PronounSex> {
  const raw = ((await ctx.db.getAttribute(ctx.actor, "SEX")) ?? "").toLowerCase();
  if (raw.startsWith("m")) return "male";
  if (raw.startsWith("f")) return "female";
  if (raw.startsWith("p") || raw.startsWith("t")) return "plural";
  return "neutral";
}

_engine.registerSub(
  (code) => ["s","S","o","O","p","P","a","A"].includes(code),
  async (code, ctx) => {
    const uctx = ctx as unknown as UrsaEvalContext;
    const sex = await getSex(uctx);
    const p = PRONOUNS[sex];
    switch (code) {
      case "s": return p.subj;    case "S": return cap(p.subj);
      case "o": return p.obj;     case "O": return cap(p.obj);
      case "p": return p.poss;    case "P": return cap(p.poss);
      case "a": return p.abs;     case "A": return cap(p.abs);
      default:  return "";
    }
  },
);

_engine.registerSub(
  (code) => code.length === 2 && (code[0] === "V" || code[0] === "v"),
  async (code, ctx) => {
    const uctx = ctx as unknown as UrsaEvalContext;
    const attrName = "V" + code[1].toUpperCase();
    return (await uctx.db.getAttribute(uctx.executor, attrName)) ?? "";
  },
);

_engine.registerSub(
  (code) => code === "l" || code === "M",
  (_code, ctx) => ctx.args[ctx.args.length - 1] ?? "",
);

const ANSI_RESET = "\x1b[0m";
const ANSI_MAP: Record<string, string> = {
  r: "\x1b[31m", g: "\x1b[32m", y: "\x1b[33m",
  b: "\x1b[34m", m: "\x1b[35m", c: "\x1b[36m",
  w: "\x1b[37m", x: "\x1b[30m",
  R: "\x1b[41m", G: "\x1b[42m", Y: "\x1b[43m",
  B: "\x1b[44m", M: "\x1b[45m", C: "\x1b[46m",
  W: "\x1b[47m", X: "\x1b[40m",
  h: "\x1b[1m", i: "\x1b[3m", u: "\x1b[4m", f: "\x1b[5m", n: ANSI_RESET,
};
function resolveAnsi(code: string): string {
  const letter = code.slice(1);
  if (letter.startsWith("<") && letter.endsWith(">")) {
    const spec = letter.slice(1, -1);
    const hex = /^#([0-9a-fA-F]{6})$/.exec(spec);
    if (hex) {
      const r = parseInt(hex[1].slice(0,2), 16);
      const g = parseInt(hex[1].slice(2,4), 16);
      const b = parseInt(hex[1].slice(4,6), 16);
      return `\x1b[38;2;${r};${g};${b}m`;
    }
    return ANSI_RESET;
  }
  return ANSI_MAP[letter] ?? ANSI_RESET;
}
_engine.registerSub(
  (code) => (code[0] === "x" || code[0] === "X" || code[0] === "c" || code[0] === "C") &&
            code.length >= 2,
  (code) => resolveAnsi(code),
);

_engine.registerSub(
  (code) => !!lookupSub(code),
  async (code, ctx) => {
    const handler = lookupSub(code);
    if (!handler) return "";
    return (await handler(ctx as unknown as Parameters<typeof handler>[0])) ?? "";
  },
);

// ── @command fallback ─────────────────────────────────────────────────────────

_engine.registerCommandFallback((name, switches, object, value, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  const sw   = switches.map((s) => `/${s}`).join("");
  const body = value !== null ? `${object ?? ""}=${value}` : (object ?? "");
  const cmd  = `@${name}${sw}${body ? " " + body : ""}`;
  uctx.output.send(`\x00atcmd\x00${cmd}`, uctx.actor.id);
  return Promise.resolve();
});

// ── &ATTR handler ─────────────────────────────────────────────────────────────

_engine.registerCommand("&", {
  exec(_switches, object, value, ctx): Promise<void> {
    const uctx = ctx as unknown as UrsaEvalContext;
    const eqIdx   = (value ?? "").indexOf("=");
    const attrName = eqIdx >= 0 ? (value ?? "").slice(0, eqIdx) : (value ?? "");
    const attrVal  = eqIdx >= 0 ? (value ?? "").slice(eqIdx + 1) : "";
    uctx.output.send(
      `\x00atcmd\x00&${attrName} ${object ?? ""}=${attrVal}`,
      uctx.actor.id,
    );
    return Promise.resolve();
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

export { _engine as softcodeEngine };

export async function runSoftcode(
  code: string,
  ctx: UrsaEvalContext,
): Promise<string> {
  _activeCtx = ctx;
  try {
    return await _engine.evalString(code, toLibCtx(ctx));
  } finally {
    _activeCtx = null;
  }
}

/**
 * Convenience wrapper: build a minimal UrsaEvalContext from plain IDs and
 * run the softcode. Used by sdk.ts and format/handlers.ts when the caller
 * only has `{actorId, executorId, args, socketId}`.
 */
export async function runSoftcodeSimple(
  code: string,
  opts: {
    actorId:    string;
    executorId: string;
    args?:      string[];
    socketId?:  string;
  },
): Promise<string> {
  const { dbojs, hydrate } = await import("../world/dbobjs.ts");
  const { send } = await import("@ursamu/core");

  const rawActor    = await dbojs.queryOne({ id: opts.actorId });
  const rawExecutor = opts.executorId !== opts.actorId
    ? await dbojs.queryOne({ id: opts.executorId })
    : rawActor;

  const actor    = rawActor    ? hydrate(rawActor)    : { id: opts.actorId,    flags: new Set<string>(), state: {}, contents: [] };
  const executor = rawExecutor ? hydrate(rawExecutor) : { id: opts.executorId, flags: new Set<string>(), state: {}, contents: [] };

  const ctx: UrsaEvalContext = {
    enactor:      opts.actorId,
    actor,
    executor,
    caller:       null,
    args:         opts.args ?? [],
    registers:    new Map(),
    iterStack:    [],
    depth:        0,
    maxDepth:     100,
    maxOutputLen: 65_536,
    deadline:     Date.now() + 5_000,
    _engine,
    db: {
      queryById:         async (id)  => { const r = await dbojs.queryOne({ id }); return r ? hydrate(r) : null; },
      queryByName:       async (name) => { const r = await dbojs.queryOne({ "data.name": new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") }); return r ? hydrate(r) : null; },
      lcon:              async (locId) => (await dbojs.query({ location: locId })).map(hydrate),
      lwho:              async () => (await dbojs.query({ flags: /connected/i })).filter((r) => r.flags.includes("player")).map(hydrate),
      lattr:             async (objId) => { const r = await dbojs.queryOne({ id: objId }); return ((r?.data?.attributes as Array<{ name: string }> | undefined) ?? []).map((a) => a.name); },
      getAttribute:      async (obj, attr) => { const attrs = (obj.state?.attributes as Array<{ name: string; value: string }> | undefined) ?? []; return attrs.find((a) => a.name.toUpperCase() === attr.toUpperCase())?.value ?? null; },
      getTagById:        async () => null,
      getPlayerTagById:  async () => null,
      lsearch:           async () => [],
      children:          async (parentId) => (await dbojs.query({ "data.parent": parentId })).map(hydrate),
      lchannels:         async () => "",
      channelsFor:       async () => "",
      mailCount:         async () => 0,
      queueLength:       async () => 0,
      getIdleSecs:       async () => 0,
      getUserFn:         async () => null,
    },
    output: {
      send: (msg: string, targetId?: string) => {
        const dest = targetId ?? opts.socketId ?? opts.actorId;
        send([dest], msg);
      },
      roomBroadcast: (msg: string, roomId: string, excludeId?: string) => {
        dbojs.query({ location: roomId }).then((contents) => {
          for (const c of contents) {
            if (c.flags.includes("connected") && c.id !== excludeId) {
              send([c.id], msg);
            }
          }
        }).catch(console.error);
      },
      broadcast: (msg: string) => {
        dbojs.query({ flags: /connected/i }).then((players) => {
          for (const p of players) send([p.id], msg);
        }).catch(console.error);
      },
    },
  };

  return runSoftcode(code, ctx);
}
