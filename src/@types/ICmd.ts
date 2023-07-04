import { IContext } from "./IContext";

export interface ICmd {
  name: string;
  pattern: string | RegExp;
  lock?: string;
  exec: (ctx: IContext, args: string[]) => void | Promise<void>;
}
