import type { IContext } from "./IContext.ts";

export interface ICmd {
  name: string;
  help?: string;
  category?: string;
  hidden?: boolean;
  pattern: string | RegExp;
  lock?: string;
  exec: (ctx: IContext, args: string[]) => void | Promise<void>;
}
