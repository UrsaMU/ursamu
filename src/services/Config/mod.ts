/**
 * Bridge: re-exports config functions from @ursamu/core.
 * initConfig, initializePlugins, registerPlugin retain their original
 * implementations below since they handle plugin loading state.
 */
export { getConfig, setConfig, getAllConfig } from "@ursamu/core";

import { getConfig, setConfig } from "@ursamu/core";
import type { IConfig } from "../../@types/IConfig.ts";
import type { IPlugin } from "../../@types/IPlugin.ts";

// ── Plugin initialization (kept local — manages the plugin registry state) ──

const _pending: IPlugin[] = [];
let _initialized = false;

export function registerPlugin(plugin: IPlugin): void {
  _pending.push(plugin);
}

export async function initializePlugins(): Promise<void> {
  if (_initialized) return;
  _initialized = true;
  for (const plugin of _pending) {
    try {
      const ok = await plugin.init?.();
      if (!ok && ok !== undefined) {
        console.warn(`[plugins] "${plugin.name}" init() returned false`);
      }
    } catch (e: unknown) {
      console.error(`[plugins] "${plugin.name}" init() threw:`, e);
    }
  }
}

export async function initConfig(cfg?: IConfig): Promise<void> {
  // Merge into @ursamu/core config so all code shares one store.
  const { initConfig: coreInit } = await import("@ursamu/core");
  await coreInit(cfg as Record<string, unknown> | undefined);
}

// Legacy exports some code still references
export const configManager = { get: getConfig, set: setConfig };
export const pluginManager = { register: registerPlugin };
export { merge } from "./utils.ts";
export { ConfigManager } from "./index.ts";
export { PluginConfigManager } from "./plugin.ts";
