import { dpath } from "../../../deps.ts";
import { IConfig } from "../../@types/IConfig.ts";
import { merge } from "./utils.ts";

/**
 * ConfigManager - A user-friendly configuration system for Deno
 * Inspired by the Node.js config package
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Record<string, any> = {};
  private configDir: string;
  private defaultConfig: IConfig;
  private pluginConfigs: Map<string, Record<string, any>> = new Map();
  private configFile = "config.json";

  private constructor(defaultConfig: IConfig, configDir?: string) {
    this.defaultConfig = defaultConfig;
    
    // If no config directory is provided, use the /config directory at the project root
    if (!configDir) {
      // Get the project root directory (two levels up from the current file)
      const currentDir = dpath.dirname(dpath.fromFileUrl(import.meta.url));
      const projectRoot = dpath.resolve(currentDir, "../../..");
      this.configDir = dpath.join(projectRoot, "config");
      
      // Create the config directory if it doesn't exist
      try {
        Deno.mkdirSync(this.configDir, { recursive: true });
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists)) {
          console.error("Error creating config directory:", error);
        }
      }
    } else {
      this.configDir = configDir;
    }
    
    this.config = { ...defaultConfig };
    this.loadConfig();
  }

  /**
   * Initialize the ConfigManager with default configuration
   */
  public static init(defaultConfig: IConfig, configDir?: string): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager(defaultConfig, configDir);
    }
    return ConfigManager.instance;
  }

  /**
   * Get the ConfigManager instance
   */
  public static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      throw new Error("ConfigManager not initialized. Call ConfigManager.init() first.");
    }
    return ConfigManager.instance;
  }

  /**
   * Get the configuration directory path
   */
  public getConfigDir(): string {
    return this.configDir;
  }

  /**
   * Load configuration from the config file
   */
  private loadConfig(): void {
    try {
      const configPath = dpath.join(this.configDir, this.configFile);
      
      // Check if config file exists
      try {
        // Use Deno's native file system API
        const fileContent = Deno.readTextFileSync(configPath);
        const fileConfig = JSON.parse(fileContent);
        
        // Merge with default config
        this.config = merge(this.defaultConfig, fileConfig);
        console.log("Configuration loaded from", configPath);
      } catch (error) {
        if (error instanceof Deno.errors.NotFound) {
          // Create default config file if it doesn't exist
          this.saveConfig();
          console.log("Default configuration created at", configPath);
        } else {
          throw error;
        }
      }
    } catch (error) {
      console.error("Error loading configuration:", error);
    }
  }

  /**
   * Save current configuration to the config file
   */
  public saveConfig(): void {
    try {
      const configPath = dpath.join(this.configDir, this.configFile);
      Deno.writeTextFileSync(configPath, JSON.stringify(this.config, null, 2));
      console.log("Configuration saved to", configPath);
    } catch (error) {
      console.error("Error saving configuration:", error);
    }
  }

  /**
   * Get a configuration value by key
   * Supports dot notation (e.g., "server.port")
   */
  public get<T>(key: string): T {
    return this.getValueByPath(this.config, key) as T;
  }

  /**
   * Set a configuration value by key
   * Supports dot notation (e.g., "server.port")
   */
  public set(key: string, value: any): void {
    this.setValueByPath(this.config, key, value);
  }

  /**
   * Get the entire configuration object
   */
  public getAll(): Record<string, any> {
    return { ...this.config };
  }

  /**
   * Reset configuration to default values
   */
  public reset(): void {
    this.config = { ...this.defaultConfig };
    this.saveConfig();
  }

  /**
   * Register a plugin configuration
   * This allows plugins to have their own configuration sections
   */
  public registerPlugin(pluginName: string, pluginConfig: Record<string, any>): void {
    this.pluginConfigs.set(pluginName, pluginConfig);
    
    // Create a plugin section in the config if it doesn't exist
    if (!this.config.plugins) {
      this.config.plugins = {};
    }
    
    // If plugin config doesn't exist yet, initialize it
    if (!this.config.plugins[pluginName]) {
      this.config.plugins[pluginName] = pluginConfig;
      this.saveConfig();
    } else {
      // Merge existing plugin config with new defaults
      this.config.plugins[pluginName] = merge(
        pluginConfig,
        this.config.plugins[pluginName]
      );
      this.saveConfig();
    }
  }

  /**
   * Get a plugin's configuration
   */
  public getPluginConfig(pluginName: string): Record<string, any> | undefined {
    return this.config.plugins?.[pluginName];
  }

  /**
   * Update a plugin's configuration
   */
  public updatePluginConfig(pluginName: string, pluginConfig: Record<string, any>): void {
    if (!this.config.plugins) {
      this.config.plugins = {};
    }
    
    this.config.plugins[pluginName] = merge(
      this.config.plugins[pluginName] || {},
      pluginConfig
    );
    
    this.saveConfig();
  }

  /**
   * Helper method to get a value using dot notation path
   */
  private getValueByPath(obj: Record<string, any>, path: string): any {
    const parts = path.split('.');
    let current = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null) {
        return undefined;
      }
      current = current[part];
    }
    
    return current;
  }

  /**
   * Helper method to set a value using dot notation path
   */
  private setValueByPath(obj: Record<string, any>, path: string, value: any): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current)) {
        current[part] = {};
      }
      current = current[part];
    }
    
    current[parts[parts.length - 1]] = value;
  }
} 