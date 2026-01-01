import { IContext } from "../../@types/IContext.ts";
import { cmdParser } from "./cmdParser.ts";

export const force = async (ctx: IContext, cmd: string) => {
  await cmdParser.run({ ...ctx, ...{ msg: cmd } });
};
