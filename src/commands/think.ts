import { Obj, dbojs } from "../services";
import { send } from "../services/broadcast";
import { addCmd } from "../services/commands";
import parser from "../services/parser/parser";

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
        })) as string
      );
    },
  });
