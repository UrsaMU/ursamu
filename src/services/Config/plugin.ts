import { parse as parseSemver, parseRange, satisfies } from "@std/semver";
import type { IPlugin } from "../../@types/IPlugin.ts";
import type { ConfigManager } from "./index.ts";

/**
 * Topologically sort plugins by their dependency declarations.
 * Plugins whose deps are not in the loaded set are included as-is —
 * missing dep detection happens during init.
 * Plugins involved in a cycle are excluded and logged.
 */
function sortByDependencies(plugins: IPlugin[]): IPlugin[] {
  const pluginMap = new Map(plugins.map(p => [p.name, p]));
  const inDegree  = new Map<string, number>(plugins.map(p => [p.name, 0]));
  const dependents = new Map<string, string[]>(plugins.map(p => [p.name, []]));

  for (const plugin of plugins) {
    for (const dep of plugin.dependencies ?? []) {
      if (!pluginMap.has(dep.name)) continue; // missing dep — caught at init time
      inDegree.set(plugin.name, (inDegree.get(plugin.name) ?? 0) + 1);
      dependents.get(dep.name)!.push(plugin.name);
    }
  }

  const queue  = plugins.filter(p => inDegree.get(p.name) === 0).map(p => p.name);
  const sorted: IPlugin[] = [];

  while (queue.length > 0) {
    const name   = queue.shift()!;
    const plugin = pluginMap.get(name);
    if (plugin) sorted.push(plugin);

    for (const dep of dependents.get(name) ?? []) {
      const deg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, deg);
      if (deg === 0) queue.push(dep);
    }
  }

  // Any plugin not in sorted is part of a cycle — halt startup
  const cycled = plugins.filter(p => !sorted.find(s => s.name === p.name));
  if (cycled.length > 0) {
    const names = cycled.map(p => p.name).join(", ");
    throw new Error(`[plugins] Circular dependency detected: ${names}. Break the cycle by using gameHooks instead of a direct dependency.`);
  }

  return sorted;
}

/**
 * Validate a plugin's declared dependencies against the loaded plugin set.
 * Returns a human-readable error string, or null if all deps are satisfied.
 */
function checkDependencies(plugin: IPlugin, pluginMap: Map<string, IPlugin>): string | null {
  for (const dep of plugin.dependencies ?? []) {
    const loaded = pluginMap.get(dep.name);
    if (!loaded) {
      return `missing dependency "${dep.name}@${dep.version}"`;
    }

    try {
      const ver   = parseSemver(loaded.version);
      const range = parseRange(dep.version);
      if (!satisfies(ver, range)) {
        return `requires "${dep.name}@${dep.version}" but found v${loaded.version}`;
      }
    } catch {
      return `invalid semver in dependency declaration "${dep.name}@${dep.version}"`;
    }
  }
  return null;
}

/**
 * PluginConfigManager — manages plugin registration and ordered initialization.
 */
export class PluginConfigManager {
  private static instance: PluginConfigManager;
  private plugins: Map<string, IPlugin> = new Map();
  private configManager: ConfigManager;

  private constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  public static init(configManager: ConfigManager): PluginConfigManager {
    if (!PluginConfigManager.instance) {
      PluginConfigManager.instance = new PluginConfigManager(configManager);
    }
    return PluginConfigManager.instance;
  }

  public static getInstance(): PluginConfigManager {
    if (!PluginConfigManager.instance) {
      throw new Error("PluginConfigManager not initialized. Call PluginConfigManager.init() first.");
    }
    return PluginConfigManager.instance;
  }

  /**
   * Register a plugin for initialization.
   *
   * - Same plugin re-registered (same name + same version) → no-op (idempotent,
   *   safe for hot-reload scenarios where init() is called more than once).
   * - Different version under the same name → throws. This closes the
   *   "imposter shadowing" vector where a malicious external plugin could
   *   declare name="jobs" at a lower version and pass dependency checks against
   *   the wrong version number after the real plugin has loaded.
   */
  public registerPlugin(plugin: IPlugin): void {
    const existing = this.plugins.get(plugin.name);
    if (existing) {
      if (existing === plugin || existing.version === plugin.version) {
        // Same object or same version — idempotent re-registration (e.g. hot-reload). No-op.
        return;
      }
      // Different version under the same name — imposter-shadowing guard.
      throw new Error(
        `[plugins] Cannot register "${plugin.name}@${plugin.version}": ` +
        `"${plugin.name}@${existing.version}" is already registered. ` +
        `Call remove() on the existing plugin before re-registering.`
      );
    }
    this.plugins.set(plugin.name, plugin);
    if (plugin.config) {
      this.configManager.registerPlugin(plugin.name, plugin.config);
    }
  }

  public getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  public getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  public getPluginConfig(pluginName: string): Record<string, unknown> | undefined {
    return this.configManager.getPluginConfig(pluginName);
  }

  public updatePluginConfig(pluginName: string, config: Record<string, unknown>): void {
    this.configManager.updatePluginConfig(pluginName, config);
    const plugin = this.plugins.get(pluginName);
    if (plugin?.config) {
      plugin.config = { ...plugin.config, ...config };
    }
  }

  /**
   * Initialize all registered plugins in dependency order.
   *
   * Missing dependency or version mismatch → throws, halting startup.
   * A plugin whose dep's init() returned false → skipped with a visible error
   * (cascade). This distinguishes "the dep isn't installed" (fatal, you must
   * fix your manifest) from "the dep loaded but disabled itself" (recoverable).
   */
  public async initializePlugins(): Promise<void> {
    const sorted  = sortByDependencies(Array.from(this.plugins.values()));
    const failed  = new Set<string>();

    for (const plugin of sorted) {
      // Cascade: skip if any declared dep failed at init
      const cascadedDep = (plugin.dependencies ?? []).find(d => failed.has(d.name));
      if (cascadedDep) {
        console.error(`[plugins] Skipping "${plugin.name}": dependency "${cascadedDep.name}" failed.`);
        failed.add(plugin.name);
        continue;
      }

      // Missing dep or version mismatch → hard halt
      const depError = checkDependencies(plugin, this.plugins);
      if (depError) {
        throw new Error(`[plugins] Cannot start: "${plugin.name}" requires ${depError}.`);
      }

      try {
        if (!plugin.init) continue;
        const success = await plugin.init();
        if (success) {
          console.log(`Plugin ${plugin.name} initialized successfully.`);
          if (plugin.config) {
            this.configManager.updatePluginConfig(plugin.name, plugin.config);
          }
        } else {
          console.warn(`[plugins] "${plugin.name}" initialization returned false.`);
          failed.add(plugin.name);
        }
      } catch (error) {
        console.error(`[plugins] Error initializing "${plugin.name}":`, error);
        failed.add(plugin.name);
      }
    }
  }
}
