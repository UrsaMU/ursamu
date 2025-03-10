import { ICmd } from "./ICmd.ts";
import { IConfig } from "./IConfig.ts";

export interface IPlugin {
  /**
   * Initialize the plugin
   */
  initialize?: () => Promise<void>;

  /**
   * Clean up plugin resources
   */
  cleanup?: () => Promise<void>;

  /**
   * Plugin metadata
   */
  meta: {
    name: string;
    version: string;
    description: string;
    author: string;
  };
}
