import { ConfigManager } from "./index.ts";
import { PluginConfigManager } from "./plugin.ts";
import { merge } from "./utils.ts";
import { IConfig } from "../../@types/IConfig.ts";
import defaultConfig from "./defaultConfig.ts";

// Initialize the ConfigManager with the default configuration
const configManager = ConfigManager.init(defaultConfig);

// Initialize the PluginConfigManager with the ConfigManager
const pluginManager = PluginConfigManager.init(configManager);

/**
 * Initialize the configuration system
 * This should be called at the start of the application
 */
export function initConfig(config?: IConfig): void {
  if (config) {
    // Merge the provided config with the default config
    const mergedConfig = merge(defaultConfig, config);
    
    // Set the merged config in the ConfigManager
    Object.entries(mergedConfig).forEach(([key, value]) => {
      configManager.set(key, value);
    });
    
    // Save the configuration
    configManager.saveConfig();
  }
}

/**
 * Get a configuration value
 * @param key The configuration key (supports dot notation)
 * @returns The configuration value
 */
export function getConfig<T>(key: string): T {
  return configManager.get<T>(key);
}

/**
 * Set a configuration value
 * @param key The configuration key (supports dot notation)
 * @param value The value to set
 */
export function setConfig(key: string, value: any): void {
  configManager.set(key, value);
  configManager.saveConfig();
}

/**
 * Get the entire configuration object
 */
export function getAllConfig(): Record<string, any> {
  return configManager.getAll();
}

/**
 * Register a plugin with the system
 */
export function registerPlugin(plugin: any): void {
  pluginManager.registerPlugin(plugin);
}

/**
 * Initialize all registered plugins
 */
export async function initializePlugins(): Promise<void> {
  await pluginManager.initializePlugins();
}

// Export everything
export {
  ConfigManager,
  PluginConfigManager,
  merge,
  configManager,
  pluginManager
}; 