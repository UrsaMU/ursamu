import { IPlugin } from "../../@types/IPlugin.ts";
import { ConfigManager } from "./index.ts";

/**
 * PluginConfigManager - Manages plugin configurations
 * This class provides a way for plugins to register their configurations
 * and for the system to load and save plugin configurations
 */
export class PluginConfigManager {
  private static instance: PluginConfigManager;
  private plugins: Map<string, IPlugin> = new Map();
  private configManager: ConfigManager;

  private constructor(configManager: ConfigManager) {
    this.configManager = configManager;
  }

  /**
   * Initialize the PluginConfigManager with the ConfigManager
   */
  public static init(configManager: ConfigManager): PluginConfigManager {
    if (!PluginConfigManager.instance) {
      PluginConfigManager.instance = new PluginConfigManager(configManager);
    }
    return PluginConfigManager.instance;
  }

  /**
   * Get the PluginConfigManager instance
   */
  public static getInstance(): PluginConfigManager {
    if (!PluginConfigManager.instance) {
      throw new Error("PluginConfigManager not initialized. Call PluginConfigManager.init() first.");
    }
    return PluginConfigManager.instance;
  }

  /**
   * Register a plugin with the system
   * This will also register the plugin's configuration with the ConfigManager
   */
  public registerPlugin(plugin: IPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin ${plugin.name} is already registered. Updating configuration.`);
    }
    
    this.plugins.set(plugin.name, plugin);
    
    // Register the plugin's configuration with the ConfigManager
    if (plugin.config) {
      this.configManager.registerPlugin(plugin.name, plugin.config);
    }
  }

  /**
   * Get a plugin by name
   */
  public getPlugin(name: string): IPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Get all registered plugins
   */
  public getAllPlugins(): IPlugin[] {
    return Array.from(this.plugins.values());
  }

  /**
   * Get a plugin's configuration
   */
  public getPluginConfig(pluginName: string): Record<string, any> | undefined {
    return this.configManager.getPluginConfig(pluginName);
  }

  /**
   * Update a plugin's configuration
   */
  public updatePluginConfig(pluginName: string, config: Record<string, any>): void {
    this.configManager.updatePluginConfig(pluginName, config);
    
    // Update the plugin's config object as well
    const plugin = this.plugins.get(pluginName);
    if (plugin && plugin.config) {
      plugin.config = { ...plugin.config, ...config };
    }
  }

  /**
   * Initialize all registered plugins
   * This will call the init method on each plugin
   */
  public async initializePlugins(): Promise<void> {
    for (const plugin of this.plugins.values()) {
      try {
        if (plugin.init) {
          const success = await plugin.init();
          if (success) {
            console.log(`Plugin ${plugin.name} initialized successfully.`);
            
            // Update the plugin's configuration if it has changed
            if (plugin.config) {
              this.configManager.updatePluginConfig(plugin.name, plugin.config);
            }
          } else {
            console.warn(`Plugin ${plugin.name} initialization returned false.`);
          }
        }
      } catch (error) {
        console.error(`Error initializing plugin ${plugin.name}:`, error);
      }
    }
  }
} 