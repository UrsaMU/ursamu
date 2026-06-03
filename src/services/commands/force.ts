import type { IContext } from "../../@types/IContext.ts";
import { runPipeline } from "@ursamu/core";
import { send } from "@ursamu/core";

export const force = async (ctx: IContext, cmd: string): Promise<void> => {
  const socketId  = ctx.socket?.id ?? "";
  const sessionId = ctx.socket?.cid ?? null;
  await runPipeline({
    socketId,
    sessionId,
    input: cmd,
    args:  [],
    send:  (msg: string) => send([socketId], msg),
  });
};
