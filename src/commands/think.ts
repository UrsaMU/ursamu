import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";

export default () =>
  addCmd({
    name: "think",
    pattern: /^think\s+(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const enactor = await Obj.get(ctx.socket.cid);
      if (!enactor) return;

      const msg = args[0];

      await send(
        [`#${enactor.id}`],
        (await parser.run({
          msg,
          data: { enactor, target: enactor },
          scope: {},
        })) as string,
      );
    },
  });
