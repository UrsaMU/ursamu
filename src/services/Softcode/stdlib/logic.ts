// deno-lint-ignore-file require-await
import { register } from "./registry.ts";
import type { EvalContext } from "../context.ts";
import type { UrsaEvalContext } from "../ursamu-context.ts";
import { toLibCtx } from "../ursamu-context.ts";

// ── helpers ───────────────────────────────────────────────────────────────

/** TinyMUX truthiness: non-empty and non-zero string is true. */
function truthy(s: string): boolean {
  if (s === "" || s === "0") return false;
  const n = parseFloat(s);
  return isNaN(n) || n !== 0;
}

// ── boolean ───────────────────────────────────────────────────────────────

register("t",       async (a) => truthy(a[0] ?? "") ? "1" : "0");
register("not",     async (a) => truthy(a[0]) ? "0" : "1");
register("and",     async (a) => a.every(truthy) ? "1" : "0");
register("or",      async (a) => a.some(truthy) ? "1" : "0");
register("andbool", async (a) => a.every(truthy) ? "1" : "0");
register("orbool",  async (a) => a.some(truthy) ? "1" : "0");
register("xor",     async (a) => (truthy(a[0]) !== truthy(a[1])) ? "1" : "0");

// ── short-circuit (args already evaluated by the caller — TinyMUX compat) ─
// Note: true short-circuit would require unevaluated args. For now these are
// functionally identical to and/or since the evaluator pre-evaluates.

register("cand",    async (a) => a.every(truthy) ? "1" : "0");
register("cor",     async (a) => a.some(truthy) ? "1" : "0");
register("candbool",async (a) => a.every(truthy) ? "1" : "0");
register("corbool", async (a) => a.some(truthy) ? "1" : "0");

// ── flag logic ────────────────────────────────────────────────────────────

register("andflags", async (_a, ctx: EvalContext) => {
  // andflags(obj, flaglist) — all flags present?
  const uctx = ctx as unknown as UrsaEvalContext;
  const obj = await uctx.db.queryById(_a[0]?.replace(/^#/,"") ?? "");
  if (!obj) return "0";
  const flags = _a[1] ?? "";
  for (const f of flags.split("")) {
    if (!obj.flags.has(f)) return "0";
  }
  return "1";
});
register("orflags", async (_a, ctx: EvalContext) => {
  const uctx = ctx as unknown as UrsaEvalContext;
  const obj = await uctx.db.queryById(_a[0]?.replace(/^#/,"") ?? "");
  if (!obj) return "0";
  const flags = _a[1] ?? "";
  for (const f of flags.split("")) {
    if (obj.flags.has(f)) return "1";
  }
  return "0";
});

// ── control flow ──────────────────────────────────────────────────────────

register("if",     async (a) => truthy(a[0]) ? (a[1] ?? "") : "");
register("ifelse", async (a) => truthy(a[0]) ? (a[1] ?? "") : (a[2] ?? ""));

/**
 * switch(str, t1, c1, [t2, c2, ...] [, default])
 * Compares str against t1, t2... using wildcard match.
 * Returns the first matching cN, or the default (odd trailing arg).
 */
register("switch", async (a) => {
  const str = a[0] ?? "";
  // Pairs: a[1]/a[2], a[3]/a[4], …
  for (let i = 1; i + 1 < a.length; i += 2) {
    if (wildcardMatch(str, a[i])) return a[i + 1] ?? "";
  }
  // Odd trailing arg = default
  if (a.length % 2 === 0) return a[a.length - 1] ?? "";
  return "";
});

/**
 * case(str, t1, c1, [t2, c2, ...] [, default])
 * Same as switch() but uses exact (case-insensitive) comparison.
 */
register("case", async (a) => {
  const str = (a[0] ?? "").toLowerCase();
  for (let i = 1; i + 1 < a.length; i += 2) {
    if ((a[i] ?? "").toLowerCase() === str) return a[i + 1] ?? "";
  }
  if (a.length % 2 === 0) return a[a.length - 1] ?? "";
  return "";
});

// ── miscellaneous ─────────────────────────────────────────────────────────

/** null(...) — evaluates args for side effects, returns empty string. */
register("null",    async () => "");

/** s(string) / eval(string) / subeval(string) — re-evaluate a string as softcode. */
async function reeval(str: string, ctx: EvalContext): Promise<string> {
  if (!str) return "";
  try {
    const uctx = ctx as unknown as UrsaEvalContext;
    const subCtx: UrsaEvalContext = { ...uctx, depth: uctx.depth + 1 };
    return await uctx._engine.evalString(str, toLibCtx(subCtx));
  } catch {
    return "";
  }
}
register(["s", "eval", "subeval"], async (a, ctx) => reeval(a[0] ?? "", ctx));

/** lit(string) — return string literally without evaluation (already done). */
register("lit",     async (a) => a[0] ?? "");

/** @@(anything) — inline comment, always returns empty string. */
register("@@",      async () => "");

// ── wildcard matching (also used by switch()) ─────────────────────────────

/**
 * Simple glob-style wildcard: * matches any sequence, ? matches one char.
 * TinyMUX switch() uses this.
 */
function wildcardMatch(str: string, pattern: string): boolean {
  // Numeric comparisons: < > operators
  if (pattern.startsWith("<")) return parseFloat(str) < parseFloat(pattern.slice(1));
  if (pattern.startsWith(">")) return parseFloat(str) > parseFloat(pattern.slice(1));

  // Convert glob to regex
  const re = "^" + pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".") + "$";
  return new RegExp(re, "i").test(str);
}
