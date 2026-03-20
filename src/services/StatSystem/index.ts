import type { IStatSystem } from "../../@types/IStatSystem.ts";

const _systems: Map<string, IStatSystem> = new Map();

/**
 * Register a stat system so it can be looked up by game plugins.
 *
 * @example
 * ```ts
 * import { registerStatSystem } from "@ursamu/ursamu";
 * registerStatSystem(myVtmStatSystem);
 * ```
 */
export function registerStatSystem(system: IStatSystem): void {
  _systems.set(system.name, system);
}

/** Retrieve a registered stat system by name. Returns `undefined` if not found. */
export function getStatSystem(name: string): IStatSystem | undefined {
  return _systems.get(name);
}

/**
 * Returns the first registered stat system, or `undefined` if none have been
 * registered. Useful for single-game setups where only one system is active.
 */
export function getDefaultStatSystem(): IStatSystem | undefined {
  return _systems.values().next().value;
}

/** Returns all registered stat system names. */
export function getStatSystemNames(): string[] {
  return [..._systems.keys()];
}
