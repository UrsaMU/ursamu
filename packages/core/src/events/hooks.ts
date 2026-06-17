import type { CoreHookMap } from "./types.ts";

type AnyHandler = (...args: unknown[]) => void | Promise<void>;
const _handlers = new Map<string, AnyHandler[]>();

function getList(event: string): AnyHandler[] {
  let list = _handlers.get(event);
  if (!list) { list = []; _handlers.set(event, list); }
  return list;
}

export interface ICoreHooks {
  on<K extends keyof CoreHookMap>(event: K, handler: CoreHookMap[K]): void;
  off<K extends keyof CoreHookMap>(event: K, handler: CoreHookMap[K]): void;
  emit<K extends keyof CoreHookMap>(event: K, ...args: Parameters<CoreHookMap[K]>): Promise<void>;
}

export const gameHooks: ICoreHooks = {
  on<K extends keyof CoreHookMap>(event: K, handler: CoreHookMap[K]): void {
    const list = getList(event as string);
    if (!list.includes(handler as AnyHandler)) list.push(handler as AnyHandler);
  },

  off<K extends keyof CoreHookMap>(event: K, handler: CoreHookMap[K]): void {
    const list = getList(event as string);
    const idx  = list.indexOf(handler as AnyHandler);
    if (idx !== -1) list.splice(idx, 1);
  },

  async emit<K extends keyof CoreHookMap>(
    event: K,
    ...args: Parameters<CoreHookMap[K]>
  ): Promise<void> {
    for (const handler of [...getList(event as string)]) {
      try {
        await handler(...(args as unknown[]));
      } catch (e: unknown) {
        console.error(`[gameHooks] Uncaught error in "${event}" handler:`, e);
      }
    }
  },
};
