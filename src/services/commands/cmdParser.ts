import { MiddlewareStack } from "./middleware";
import { ICmd } from "../../@types/ICmd";
import { flags } from "../flags/flags";
import { getCharacter } from "../characters/character";
import { send } from "../broadcast";
import { dbojs } from "../Database";
import { matchExits } from "./movement";
import { matchChannel } from "./channels";

export const cmdParser = new MiddlewareStack();
export const cmds: ICmd[] = [];
export const txtFiles = new Map<string, string>();

export const addCmd = (...cmd: ICmd[]) => cmds.push(...cmd);

cmdParser.use(async (ctx, next) => {
  const char = await getCharacter(ctx.socket.cid);

  const { msg } = ctx;
  for (const cmd of cmds) {
    const match = msg?.trim().match(cmd.pattern);
    if (flags.check(char?.flags || "", cmd.lock || "")) {
      if (match) {
        if (char) {
          char.data ||= {};
          char.data.lastCommand = Date.now();
          await dbojs.update({ id: char.id }, char);
        }
        await cmd.exec(ctx, match.slice(1));
        return;
      }
    }
  }
  await next();
});

cmdParser.use(async (ctx, next) => {
  if (await matchExits(ctx)) return;
  await next();
});

cmdParser.use(async (ctx, next) => {
  if (await matchChannel(ctx)) return;
  await next();
});

cmdParser.use(async (ctx, next) => {
  if (ctx.socket.cid) {
    send([ctx.socket.id], "Huh? Type 'help' for help.", { error: true });
  }
});
