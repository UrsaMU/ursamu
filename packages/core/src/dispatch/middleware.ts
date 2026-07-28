import type { IMiddlewareFn } from "./types.ts";

const _middleware: IMiddlewareFn[] = [];

/**
 * Register input middleware. Runs in registration order before handlers.
 * Prefer a named function so {@link removeMiddleware} can tear it down.
 */
export function addMiddleware(fn: IMiddlewareFn): void {
  _middleware.push(fn);
}

/**
 * Remove one middleware by function reference (same ref as addMiddleware).
 * Returns true if it was present. No-op if already removed.
 */
export function removeMiddleware(fn: IMiddlewareFn): boolean {
  const i = _middleware.indexOf(fn);
  if (i < 0) return false;
  _middleware.splice(i, 1);
  return true;
}

/** Drop all middleware (tests / full reset). Prefer removeMiddleware in plugins. */
export function clearMiddleware(): void {
  _middleware.length = 0;
}

export function getMiddleware(): readonly IMiddlewareFn[] {
  return _middleware;
}
