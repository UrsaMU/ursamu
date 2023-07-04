import { IContext } from "../../@types/IContext";
import { cmdParser } from "./cmdParser";

export const force = async (ctx: IContext, cmd: string) => {
  cmdParser.run({ ...ctx, ...{ msg: cmd } });
};
