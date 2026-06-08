/**
 * Plugin loader — registers plugins, resolves dependency order,
 * and calls init()/remove() in the correct sequence.
 *
 * Dependency resolution: topological sort (Kahn's algorithm).
 * Semver check: declared dep version is validated against installed version.
 */
import { parse as parseSemver, parseRange, satisfies } from "@std/semver";
import type { IPlugin } from "./types.ts";
import { registryAdd, registryGet, registryHas, registryList, registryRemove } from "./registry.ts";
import { log } from "../logging/index.ts";

const _pending: IPlugin[] = [];
let _initialized = false;

/** Stage a plugin for loading. Call loadPlugins() to actually init them. */
export function registerPlugin(plugin: IPlugin): void {
  _pending.push(plugin);
}

/** Init all staged plugins in dependency order. Fails fast on missing deps. */
export async function loadPlugins(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  await forceLoadPlugins();
}

/** Internal: actually run the load logic without checking _initialized. */
export async function forceLoadPlugins(): Promise<void> {
  const sorted = topoSort(_pending);
  _pending.length = 0;

  for (const plugin of sorted) {
    const err = checkDeps(plugin);
    if (err) throw new Error(`Plugin "${plugin.name}": ${err}`);

    const ok = await plugin.init();
    if (!ok && ok !== undefined) {
      console.warn(`[plugins] "${plugin.name}" init() returned false`);
    }

    registryAdd(plugin);
    log("info", "plugin:loaded", { name: plugin.name, version: plugin.version });
  }
}

/** Legacy alias for loadPlugins() used by some consumers. */
export const initializePlugins = loadPlugins;

/** Remove and call remove() on a loaded plugin. */
export async function unloadPlugin(name: string): Promise<void> {
  const plugin = registryRemove(name);
  if (!plugin) return;
  try {
    await plugin.remove();
    log("info", "plugin:unloaded", { name });
  } catch (e: unknown) {
    log("error", "plugin:unload_error", { name, error: String(e) });
  }
}

// ── Internal ─────────────────────────────────────────────────────────────────

function checkDeps(plugin: IPlugin): string | null {
  for (const dep of plugin.dependencies ?? []) {
    const installed = registryGet(dep.name);
    if (!installed) return `missing dependency "${dep.name}"`;
    try {
      if (!satisfies(parseSemver(installed.version), parseRange(dep.version))) {
        return `"${dep.name}" v${installed.version} does not satisfy ${dep.version}`;
      }
    } catch {
      return `invalid semver "${dep.version}" for dep "${dep.name}"`;
    }
  }
  return null;
}

function topoSort(plugins: IPlugin[]): IPlugin[] {
  const map = new Map(plugins.map((p) => [p.name, p]));
  const sorted: IPlugin[] = [];
  const visiting = new Set<string>();
  const visited  = new Set<string>();

  function visit(name: string): void {
    if (visited.has(name)) return;
    if (visiting.has(name)) throw new Error(`Circular plugin dependency: ${name}`);
    visiting.add(name);
    const p = map.get(name);
    if (p) {
      for (const dep of p.dependencies ?? []) {
        if (map.has(dep.name)) visit(dep.name);
      }
      sorted.push(p);
    }
    visiting.delete(name);
    visited.add(name);
  }

  for (const p of plugins) {
    if (!registryHas(p.name)) visit(p.name);
  }
  return sorted;
}

export { registryList as listPlugins, registryGet as getPlugin, registryRemove as _registryRemove };
