// Substitution registry — plugin-registered %<code> handlers.
// Loaded by evaluator.ts after the built-in %x switch so plugins can
// add custom substitutions without forking the engine.
//
// Usage (in a plugin):
//   import { registerSub } from "jsr:@ursamu/ursamu";
//   registerSub("$", async (ctx) => String((ctx.actor.state as any)?.gold ?? 0));
//   → %$ now expands to the actor's gold value in any softcode expression.

import type { EvalContext } from "../context.ts";

export type SubHandler = (ctx: EvalContext) => string | Promise<string>;

const _subs = new Map<string, SubHandler>();

/**
 * Register a custom %<code> substitution handler.
 *
 * @param code    The character(s) after % that trigger this handler.
 *                Single char: `"$"` → `%$`.
 *                Multi-char:  `"xp"` → `%xp` (checked before built-ins of same length).
 * @param handler Receives the current EvalContext, returns the expansion string.
 *
 * @example
 *   registerSub("$", async (ctx) =>
 *     String((ctx.actor.state as Record<string,unknown>)?.gold ?? 0));
 */
export function registerSub(code: string, handler: SubHandler): void {
  _subs.set(code, handler);
}

/** Look up a plugin-registered substitution handler (exact match). */
export function lookupSub(code: string): SubHandler | undefined {
  return _subs.get(code);
}
