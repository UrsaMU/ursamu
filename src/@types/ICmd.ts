import type { IUrsamuSDK } from "./UrsamuSDK.ts";

export interface ICmd {
  name: string;
  help?: string;
  category?: string;
  hidden?: boolean;
  pattern: string | RegExp;
  lock?: string;
  exec: (u: IUrsamuSDK) => void | Promise<void>;
}
