import { MiddlewareStack } from "./middleware";
import { ICmd } from "../../@types/ICmd";
import { flags } from "../flags/flags";
import { send } from "../broadcast";
import { dbojs } from "../Database";
import { matchExits } from "./movement";
import { matchChannel } from "./channels";
import { Obj } from "../DBObjs";

export const cmdParser = new MiddlewareStack();
export const cmds: ICmd[] = [];

export const addCmd = (...newCmds: ICmd[]) => {
  for (const cmd of newCmds) {
    // Check if command with same name already exists
    const existingIndex = cmds.findIndex((existing) =>
      existing.name === cmd.name
    );
    if (existingIndex !== -1) {
      // Replace existing command
      cmds[existingIndex] = cmd;
    } else {
      // Add new command
      cmds.push(cmd);
    }
  }
};

cmdParser.use(async (ctx, next) => {
  const char = await Obj.get(ctx.socket.cid);
  if (!char) return;

  const { msg } = ctx;
  for (const cmd of cmds) {
    const match = msg?.trim().match(cmd.pattern);
    if (flags.check(char?.flags || "", cmd.lock || "")) {
      if (match) {
        const obj = await Obj.get(char.id);
        if (!obj) return;
        obj.data ||= {};
        obj.data.lastCommand = Date.now();
        await obj.save();
        
        await cmd.exec(ctx, match.slice(1))?.catch((e) => {
          console.error(e);
          send(
            [ctx.socket.id],
            `Uh oh! You've run into an error! please contact staff with the following info!%r%r%chError:%cn ${e}`,
            { error: true },
          );
        });
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
