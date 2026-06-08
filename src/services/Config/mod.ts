/**
 * Bridge: re-exports config and plugin functions from @ursamu/core.
 */
export {
  getConfig,
  setConfig,
  getAllConfig,
  initConfig,
  registerPlugin,
  loadPlugins as initializePlugins,
} from "@ursamu/core";

// Legacy exports some code still references
import { getConfig, setConfig, registerPlugin, getAllConfig } from "@ursamu/core";

export class ConfigManager {
  public static init(cfg: any) { return ConfigManager.getInstance(); }
  public static getInstance() { return new ConfigManager(); }
  public get<T>(key: string): T { return getConfig(key); }
  public set(key: string, value: any) { setConfig(key, value); }
  public getAll() { return getAllConfig(); }
}

export const configManager = new ConfigManager();
export const pluginManager = { register: registerPlugin };

export class PluginConfigManager {
  public static getInstance() { return new PluginConfigManager(); }
  public registerPlugin(p: any) { registerPlugin(p); }
}
