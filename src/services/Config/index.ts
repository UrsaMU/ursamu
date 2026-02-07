import { dpath } from "../../../deps.ts";
import type { IConfig } from "../../@types/IConfig.ts";
import { merge } from "./utils.ts";

/**
 * ConfigManager - A user-friendly configuration system for Deno
 * Inspired by the Node.js config package
 */
export class ConfigManager {
  private static instance: ConfigManager;
  private config: Record<string, unknown> = {};
  private configDir: string;
  private defaultConfig: IConfig;
  private pluginConfigs: Map<string, Record<string, unknown>> = new Map();
  private configFile = "config.json";

  private constructor(defaultConfig: IConfig, configDir?: string) {
    this.defaultConfig = defaultConfig;
    
    // If no config directory is provided, use the /config directory at the project root
    if (!configDir) {
      this.configDir = dpath.join(Deno.cwd(), "config");
      
      // Create the config directory if it doesn't exist
      try {
        Deno.mkdirSync(this.configDir, { recursive: true });
      } catch (error) {
        if (!(error instanceof Deno.errors.AlreadyExists) && !(error instanceof Deno.errors.AlreadyExists)) {
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
        this.config = merge(this.defaultConfig as unknown as Record<string, unknown>, fileConfig);
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
      const newContent = JSON.stringify(this.config, null, 2);
      
      // Only write if content has changed to avoid triggering watcher restarts
      try {
        const existingContent = Deno.readTextFileSync(configPath);
        if (existingContent === newContent) {
          return;
        }
      } catch (_e) {
        // File might not exist yet, proceed with write
      }

      Deno.writeTextFileSync(configPath, newContent);
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
  public set(key: string, value: unknown): void {
    this.setValueByPath(this.config, key, value);
  }

  /**
   * Get the entire configuration object
   */
  public getAll(): Record<string, unknown> {
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
  public registerPlugin(pluginName: string, pluginConfig: Record<string, unknown>): void {
    this.pluginConfigs.set(pluginName, pluginConfig);
    
    // Create a plugin section in the config if it doesn't exist
    const config = this.config as Record<string, unknown>;
    if (!config.plugins) {
      config.plugins = {};
    }
    
    const plugins = config.plugins as Record<string, unknown>;
    // If plugin config doesn't exist yet, initialize it
    if (!plugins[pluginName]) {
      plugins[pluginName] = pluginConfig;
      this.saveConfig();
    } else {
      // Merge existing plugin config with new defaults
      plugins[pluginName] = merge(
        pluginConfig,
        plugins[pluginName] as Record<string, unknown>
      );
      this.saveConfig();
    }
  }

  /**
   * Get a plugin's configuration
   */
  public getPluginConfig(pluginName: string): Record<string, unknown> | undefined {
    const config = this.config as Record<string, unknown>;
    const plugins = config.plugins as Record<string, unknown> | undefined;
    if (!plugins) return undefined;
    return plugins[pluginName] as Record<string, unknown>;
  }

  /**
   * Update a plugin's configuration
   */
  public updatePluginConfig(pluginName: string, pluginConfig: Record<string, unknown>): void {
    const config = this.config as Record<string, unknown>;
    if (!config.plugins) {
      config.plugins = {};
    }
    
    const plugins = config.plugins as Record<string, unknown>;
    plugins[pluginName] = merge(
      (plugins[pluginName] as Record<string, unknown>) || {},
      pluginConfig
    );
    
    this.saveConfig();
  }

  /**
   * Helper method to get a value using dot notation path
   */
  private getValueByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    
    for (const part of parts) {
      if (current === undefined || current === null || typeof current !== 'object') {
        return undefined;
      }
      current = (current as Record<string, unknown>)[part];
    }
    
    return current;
  }

  /**
   * Helper method to set a value using dot notation path
   */
  private setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current = obj;
    
    for (let i = 0; i < parts.length - 1; i++) {
      const part = parts[i];
      if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
        current[part] = {};
      }
      current = current[part] as Record<string, unknown>;
    }
    
    current[parts[parts.length - 1]] = value;
  }
} 