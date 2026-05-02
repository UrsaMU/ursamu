import { register } from "./registry.ts";

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

// Note: localize() is registered as a lazy FunctionImpl in ursamu-engine.ts
// so it has access to un-evaluated thunks and can properly isolate registers.
