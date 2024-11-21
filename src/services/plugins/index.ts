import path from "path";
import { IConfig, IPluginConfig } from "../../@types/IConfig";
import { IPlugin } from "../../@types/IPlugin";

export class PluginService {
  private loadedPlugins: Map<string, IPlugin> = new Map();

  constructor(private config: IConfig) {}

  /**
   * Initialize and load all enabled plugins
   */
  async initialize() {
    const plugins = this.config.plugins || {};

    for (const [name, pluginConfig] of Object.entries(plugins)) {
      if (pluginConfig.enabled) {
        await this.loadPlugin(name, pluginConfig);
      }
    }
  }

  /**
   * Load a single plugin
   */
  private async loadPlugin(name: string, config: IPluginConfig) {
    try {
      let plugin: IPlugin;

      if (config.package) {
        // Load from npm package
        plugin = await import(config.package);
      } else if (config.path) {
        // Load from local path
        plugin = await import(config.path);
      } else {
        throw new Error(`Plugin ${name} has no package or path specified`);
      }

      if (!plugin) {
        throw new Error(`Failed to load plugin ${name}`);
      }

      // Initialize the plugin
      if (plugin.initialize) {
        await plugin.initialize();
      }

      this.loadedPlugins.set(name, plugin);
      console.log(`Plugin ${name} loaded successfully`);
    } catch (error) {
      console.error(`Error loading plugin ${name}:`, error);
    }
  }

  /**
   * Enable a plugin
   */
  async enablePlugin(name: string) {
    const pluginConfig = this.config.plugins?.[name];
    if (!pluginConfig) {
      throw new Error(`Plugin ${name} not found in configuration`);
    }

    if (!pluginConfig.enabled) {
      pluginConfig.enabled = true;
      await this.loadPlugin(name, pluginConfig);
    }
  }

  /**
   * Disable a plugin
   */
  async disablePlugin(name: string) {
    const plugin = this.loadedPlugins.get(name);
    if (!plugin) {
      throw new Error(`Plugin ${name} is not loaded`);
    }

    // Call cleanup if available
    if (plugin.cleanup) {
      await plugin.cleanup();
    }

    this.loadedPlugins.delete(name);

    if (this.config.plugins?.[name]) {
      this.config.plugins[name].enabled = false;
    }
  }

  /**
   * Get a loaded plugin by name
   */
  getPlugin(name: string): IPlugin | undefined {
    return this.loadedPlugins.get(name);
  }

  /**
   * Get all loaded plugins
   */
  getAllPlugins(): Map<string, IPlugin> {
    return this.loadedPlugins;
  }
}

// Export a singleton instance
export const pluginService = new PluginService(
  require("../../ursamu.config").default.config,
);
