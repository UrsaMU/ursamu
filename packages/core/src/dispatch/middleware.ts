import type { IMiddlewareFn } from "./types.ts";

const _middleware: IMiddlewareFn[] = [];

export function addMiddleware(fn: IMiddlewareFn): void {
  _middleware.push(fn);
}

export function getMiddleware(): readonly IMiddlewareFn[] {
  return _middleware;
}
