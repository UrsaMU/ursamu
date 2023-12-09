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
      console.log(args);
      const tar = await target(en, args[1]);
      if (!tar) return send([ctx.socket.id], "%chGame>%cn Target not found.");

      const tarObj = await Obj.get(tar.id);
      if (!tarObj)
        return send([ctx.socket.id], "%chGame>%cn Target not found.");

      if (!canEdit(en, tar)) {
        return send([ctx.socket.id], "%chGame>%cn You can't edit that.");
      }
      if (!tarObj.data) tarObj.dbobj.data = { attributes: [] };

      const attr = tarObj.data?.attributes?.find((a) =>
        a.name.toLowerCase().startsWith(args[0].toLowerCase())
      );

      if (attr && tarObj && tarObj.data) {
        if (!args[2]) {
          tarObj.data.attributes = tar.data?.attributes?.filter(
            (a) => a.name !== attr.name
          );
          await tarObj.save();
          return await send(
            [ctx.socket.id],
            `%chGame>%cn  ${
              tarObj.name
            }'s attribute %ch${attr.name.toUpperCase()}%cn removed.`
          );
        } else {
          attr.value = args[2];
          attr.setter = en.dbref;
          await tarObj.save();
          return await send(
            [ctx.socket.id],
            `%chGame>%cn  ${
              tarObj.name
            }'s attribute %ch${attr.name.toUpperCase()}%cn set.`
          );
        }
      } else if (!attr && tarObj && tarObj.data) {
        tarObj.data.attributes ||= [];

        tarObj.dbobj.data?.attributes?.push({
          name: args[0],
          value: args[2],
          setter: en.dbref,
          type: "attribute",
        });

        await tarObj.save();
        return await send(
          [ctx.socket.id],
          `%chGame>%cn  ${
            tarObj.name
          }'s attribute %ch${args[0].toUpperCase()}%cn set.`
        );
      } else {
        return await send(
          [ctx.socket.id],
          "%chGame>%cn  Something went wrong."
        );
      }
    },
  });
};
