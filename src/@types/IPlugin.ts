import type { IConfig } from "./IConfig.ts";

/** A semver-aware dependency declaration for a plugin. */
export interface IPluginDependency {
  /** Plugin name as declared in IPlugin.name */
  name: string;
  /**
   * Semver range string — e.g. "^1.0.0", ">=2.1.0".
   * Checked against the loaded plugin's version at startup.
   */
  version: string;
}

export interface IPlugin {
  name: string;
  description?: string;
  version: string;
  config?: IConfig;
  /**
   * Plugins that must be loaded and initialized before this plugin.
   * Missing dep or version mismatch → throws at startup (server halts).
   * Dep whose init() returned false → this plugin is cascade-skipped with
   * a visible error; server continues.
   */
  dependencies?: IPluginDependency[];
  init?: () => boolean | Promise<boolean>;
  remove?: () => void | Promise<void>;
}
