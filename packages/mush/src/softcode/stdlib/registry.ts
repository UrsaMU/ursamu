// Standalone registry — no imports from other stdlib modules.
// Both index.ts (the loader) and individual modules (math, string, etc.)
// import from here, which breaks the circular dependency.

import type { EvalContext } from "../context.ts";

/**
 * rawArgs contains the original (un-evaluated) source text of each argument.
 * Functions like iter(), localize(), parse() use rawArgs to re-evaluate their
 * expression arguments in the appropriate context (e.g. with ## bound).
 * Functions that only need pre-evaluated values can ignore rawArgs.
 */
export type StdlibFn = (args: string[], ctx: EvalContext, rawArgs: string[]) => Promise<string>;

const _registry = new Map<string, StdlibFn>();

/** Register a built-in function under one or more names (all lowercased). */
export function register(names: string | string[], fn: StdlibFn): void {
  const list = Array.isArray(names) ? names : [names];
  for (const n of list) _registry.set(n.toLowerCase(), fn);
}

/** Look up a built-in function by name (case-insensitive). */
export function lookup(name: string): StdlibFn | undefined {
  return _registry.get(name.toLowerCase());
}

/** Iterate all registered function names and their implementations. */
export function entries(): IterableIterator<[string, StdlibFn]> {
  return _registry.entries();
}
