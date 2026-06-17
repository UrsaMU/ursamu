import type { ICoreHandler } from "./types.ts";

const _handlers: ICoreHandler[] = [];

export function addHandler(handler: ICoreHandler): void {
  _handlers.push(handler);
}

export function removeHandler(name: string): void {
  const idx = _handlers.findIndex((h) => h.name === name);
  if (idx !== -1) _handlers.splice(idx, 1);
}

export function getHandlers(): readonly ICoreHandler[] {
  return _handlers;
}

export function matchHandler(
  input: string,
): { handler: ICoreHandler; args: string[] } | null {
  for (const handler of _handlers) {
    if (typeof handler.pattern === "string") {
      if (input === handler.pattern) return { handler, args: [] };
      continue;
    }
    const m = handler.pattern.exec(input);
    if (m) return { handler, args: m.slice(1) };
  }
  return null;
}
