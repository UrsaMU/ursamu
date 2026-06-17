import type { IPlugin } from "./types.ts";

const _loaded = new Map<string, IPlugin>();

export function registryAdd(plugin: IPlugin): void {
  _loaded.set(plugin.name, plugin);
}

export function registryRemove(name: string): IPlugin | undefined {
  const p = _loaded.get(name);
  _loaded.delete(name);
  return p;
}

export function registryGet(name: string): IPlugin | undefined {
  return _loaded.get(name);
}

export function registryList(): IPlugin[] {
  return Array.from(_loaded.values());
}

export function registryHas(name: string): boolean {
  return _loaded.has(name);
}
