import { ICmd } from "./ICmd";
import { IConfig } from "./IConfig";

export interface IPlugin {
  name: string;
  description?: string;
  version: string;
  config?: IConfig;

  init?: () => boolean | Promise<boolean>;
  remove?: () => void | Promise<void>;
}
