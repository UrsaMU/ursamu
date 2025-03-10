import { Obj, addCmd, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";

export default () => {
  addCmd({
    name: "&",
    pattern: /^&(.*)\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en.dbobj, args[1]);
      if (!tar) return send([ctx.socket.id], "%chGame>%cn Target not found.");

      const tarObj = await Obj.get(tar.id);
      if (!tarObj) {
        return send([ctx.socket.id], "%chGame>%cn Target not found.");
      }

      if (!canEdit(en.dbobj, tar)) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      tarObj.data ||= { attributes: [] };

      const attr = tarObj.data.attributes?.find((a) =>
        a.name.toLowerCase().startsWith(args[0].toLowerCase())
      );

      if (attr) {
        if (!args[2]) {
          tarObj.data.attributes = tarObj.data.attributes?.filter(
            (a) => a.name !== attr.name,
          );
          await tarObj.save();
          return await send(
            [ctx.socket.id],
            `%chGame>%cn  ${tarObj.name}'s attribute %ch${attr.name.toUpperCase()}%cn removed.`,
          );
        } else {
          attr.value = args[2];
          attr.setter = en.dbref;
          await tarObj.save();
          return await send(
            [ctx.socket.id],
            `%chGame>%cn  ${tarObj.name}'s attribute %ch${attr.name.toUpperCase()}%cn set.`,
          );
        }
      } else {
        tarObj.data.attributes ||= [];

        tarObj.data.attributes?.push({
          name: args[0],
          value: args[2],
          setter: en.dbref,
          type: "attribute",
          data: {},
        });

        await tarObj.save();
        return await send(
          [ctx.socket.id],
          `%chGame>%cn  ${tarObj.name}'s attribute %ch${
            args[0].toUpperCase()
          }%cn set.`,
        );
      }
    },
  });
};
