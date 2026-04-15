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
  EvalContext,
  FunctionImpl,
  EvalThunk,
} from "@ursamu/mushcode/eval";
import type { UrsaEvalContext } from "./ursamu-context.ts";
import {
  snapshotRegisters,
  restoreRegisters,
  toLibCtx,
  makeSubCtx,
} from "./ursamu-context.ts";

// Import all UrsaMU stdlib modules (side-effect registrations into _registry).
import "./stdlib/index.ts";
import { entries } from "./stdlib/index.ts";
import type { StdlibFn } from "./stdlib/index.ts";

// Import subRegistry for plugin-registered substitutions.
import { lookupSub } from "./stdlib/subRegistry.ts";

// ── Bridge ObjectAccessor ─────────────────────────────────────────────────────
// The new lib's engine requires an ObjectAccessor at construction time.
// We use a module-level ref updated before each evalString call so the
// bridge can forward to the per-eval DbAccessor without capturing it.

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
};

// ── Engine construction ───────────────────────────────────────────────────────

const _engine = new EvalEngine(bridgeAccessor);

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

/**
 * switch(str, pat1, val1, [pat2, val2, ...] [, default])
 *
 * Classic MUSH switch(): lazy evaluation + glob wildcard matching.
 * The new lib's built-in switch uses exact case-insensitive matching only,
 * which breaks patterns like "0*", "hel*", ">5" that MUSH code relies on.
 */
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
    // Odd trailing arg = default
    if (thunks.length % 2 === 0) return await thunks[thunks.length - 1]();
    return "";
  },
});

// localize(expr) — evaluates expr but restores registers afterward.
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

// iter alias: "parse" is a TinyMUX alias for iter.
// Get the iter impl registered by registerStdlib and alias it.
const _iterImpl = ((_engine as unknown as { functions: Map<string, FunctionImpl> }).functions).get("iter");
if (_iterImpl) {
  _engine.registerFunction("parse", _iterImpl);
}

// ── Register all UrsaMU stdlib functions ──────────────────────────────────────
// Skip any function already correctly provided by registerStdlib() above.
// UrsaMU only needs to add functions that are absent from the new lib or that
// require IDBObj context / richer semantics (u, get, name, hasattr, hasflag, setq).
const SKIP_NAMES = new Set([
  // Already handled as lazy FunctionImpl above
  "iter", "parse", "localize",

  // Pure math — new lib covers these exactly
  "add", "sub", "mul", "div", "mod", "abs", "round", "floor", "ceil",
  "max", "min", "power", "sqrt",

  // Pure string — new lib covers these exactly
  "strlen", "mid", "left", "right", "trim",
  "ljust", "rjust", "center", "ucstr", "lcstr", "capstr", "cat", "space", "repeat",

  // Pure comparison — new lib covers these exactly
  "eq", "neq", "gt", "gte", "lt", "lte",

  // Logic — new lib handles lazy short-circuit evaluation correctly.
  // switch is NOT skipped: UrsaMU registers its own lazy+glob version above.
  "if", "ifelse", "and", "or", "not", "t",

  // Register — new lib's r/setr are fine; setq is skipped because UrsaMU's
  // version supports variadic pairs: setq(r1,v1,r2,v2,...) which new lib does not.
  "r", "setr",

  // Iter list helpers — new lib covers these exactly
  "words", "word", "first", "last", "rest",
]);

for (const [name, fn] of entries()) {
  if (!SKIP_NAMES.has(name)) {
    _engine.registerFunction(name, wrapFn(fn));
  }
}

// ── Custom substitution handlers ──────────────────────────────────────────────

// Override %# — use actor.id
_engine.registerSub("#", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return `#${uctx.actor.id}`;
});

// Override %! — executor is IDBObj in UrsaMU
_engine.registerSub("!", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return `#${uctx.executor.id}`;
});

// Override %@ — caller is IDBObj | null in UrsaMU
_engine.registerSub("@", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return uctx.caller ? `#${uctx.caller.id}` : "#-1";
});

// Override %N and %n — use actor.name
_engine.registerSub("N", (_code, ctx) =>
  (ctx as unknown as UrsaEvalContext).actor.name ?? "");
_engine.registerSub("n", (_code, ctx) =>
  ((ctx as unknown as UrsaEvalContext).actor.name ?? "").toLowerCase());

// Override %L — use actor.location
_engine.registerSub("L", (_code, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  return uctx.actor.location ? `#${uctx.actor.location}` : "#-1";
});

// Pronouns — %s %S %o %O %p %P %a %A
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

// %Va–%Vz and %va–%vz — variable attribute shorthand
_engine.registerSub(
  (code) => code.length === 2 && (code[0] === "V" || code[0] === "v"),
  async (code, ctx) => {
    const uctx = ctx as unknown as UrsaEvalContext;
    const attrName = "V" + code[1].toUpperCase();
    return (await uctx.db.getAttribute(uctx.executor, attrName)) ?? "";
  },
);

// %l and %M — last arg
_engine.registerSub(
  (code) => code === "l" || code === "M",
  (_code, ctx) => ctx.args[ctx.args.length - 1] ?? "",
);

// %w and %| — stubs
_engine.registerSub("w", () => "");
_engine.registerSub("|", () => "");

// ANSI codes — %xr, %cb, %ch, %cn, %x<#RRGGBB>, etc.
// Override the new lib's passthrough behavior with actual ANSI resolution.
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

// Plugin-registered substitutions from subRegistry.ts
_engine.registerSub(
  (code) => !!lookupSub(code),
  async (code, ctx) => {
    const handler = lookupSub(code);
    if (!handler) return "";
    return (await handler(ctx as unknown as Parameters<typeof handler>[0])) ?? "";
  },
);

// ── @command fallback — all @commands forward to main thread via sentinel ─────

_engine.registerCommandFallback(async (name, switches, object, value, ctx) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  const sw   = switches.map((s) => `/${s}`).join("");
  const body = value !== null ? `${object ?? ""}=${value}` : (object ?? "");
  const cmd  = `@${name}${sw}${body ? " " + body : ""}`;
  uctx.output.send(`\x00atcmd\x00${cmd}`, uctx.actor.id);
});

// ── &ATTR handler — attribute setting sentinel ────────────────────────────────

_engine.registerCommand("&", {
  async exec(_switches, object, value, ctx) {
    const uctx = ctx as unknown as UrsaEvalContext;
    // value = "ATTRNAME=attrvalue" (from AttributeSet node), object = objectref
    const eqIdx   = (value ?? "").indexOf("=");
    const attrName = eqIdx >= 0 ? (value ?? "").slice(0, eqIdx) : (value ?? "");
    const attrVal  = eqIdx >= 0 ? (value ?? "").slice(eqIdx + 1) : "";
    uctx.output.send(
      `\x00atcmd\x00&${attrName} ${object ?? ""}=${attrVal}`,
      uctx.actor.id,
    );
  },
});

// ── Export ────────────────────────────────────────────────────────────────────

export { _engine as softcodeEngine };

/**
 * Run softcode in a UrsaEvalContext.
 * Sets up the active context ref for the bridge accessor and calls evalString.
 */
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
