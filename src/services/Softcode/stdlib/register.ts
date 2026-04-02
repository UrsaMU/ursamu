import { register } from "./registry.ts";
import { snapshotRegisters, restoreRegisters } from "../context.ts";
import type { EvalContext } from "../context.ts";
import { evaluate } from "../evaluator.ts";
import { parse } from "../parser.ts";

/**
 * setq(register, value) — set a local register, return empty string.
 * setq(r1, v1, r2, v2, ...) — set multiple registers in one call (TinyMUX 2.10+).
 */
register("setq", (a, ctx) => {
  for (let i = 0; i + 1 < a.length; i += 2) {
    ctx.registers.set(a[i], a[i + 1] ?? "");
  }
  return Promise.resolve("");
});

/**
 * setr(register, value) — set a local register, return the value.
 */
register("setr", (a, ctx) => {
  const val = a[1] ?? "";
  ctx.registers.set(a[0] ?? "0", val);
  return Promise.resolve(val);
});

/**
 * r(register) — read a local register value.
 */
register("r", (a, ctx) => Promise.resolve(ctx.registers.get(a[0] ?? "0") ?? ""));

/**
 * localize(expression) — evaluate expression with register isolation.
 * Any setq() calls inside do not affect the outer register state.
 * This is the mechanism behind ulocal()'s register preservation.
 */
register("localize", async (a, ctx: EvalContext, raw) => {
  const snapshot = snapshotRegisters(ctx);
  let result = "";
  try {
    // Use raw source text so the expression is evaluated AFTER the snapshot,
    // meaning any setq() inside cannot affect outer registers.
    const code = raw[0] ?? a[0] ?? "";
    const ast  = safeParse(code);
    result     = ast ? await evaluate(ast as Parameters<typeof evaluate>[0], ctx) : code;
  } finally {
    restoreRegisters(ctx, snapshot);
  }
  return result;
});

function safeParse(code: string): ReturnType<typeof parse> | null {
  try { return parse(code) as ReturnType<typeof parse>; }
  catch { return null; }
}
