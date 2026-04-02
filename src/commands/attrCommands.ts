import { Obj, addCmd, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "&",
    pattern: /^&(.*)\s+(.*)\s*=\s*(.*)?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await Obj.get(u.me.id);
      if (!en) return;
      const tar = await target(en.dbobj, u.cmd.args[1]);
      if (!tar) return send([u.socketId || ""], "%chGame>%cn Target not found.");

      const tarObj = await Obj.get(tar.id);
      if (!tarObj) return send([u.socketId || ""], "%chGame>%cn Target not found.");

      if (!await canEdit(en.dbobj, tar)) {
        return send([u.socketId || ""], "%chGame>%cn You can't edit that.");
      }
      if (!tarObj.data) tarObj.dbobj.data = { attributes: [] };
      // deno-lint-ignore no-explicit-any
      const data = tarObj.data as any;

      // Parse optional /softcode suffix from attribute name: &ATTRNAME/softcode obj=val
      const rawName = u.cmd.args[0];
      const slashIdx = rawName.indexOf("/");
      const attrName = slashIdx === -1 ? rawName : rawName.slice(0, slashIdx);
      const typeHint  = slashIdx === -1 ? "attribute"
        : rawName.slice(slashIdx + 1).toLowerCase() === "softcode" ? "softcode" : "attribute";

      const attr = data?.attributes?.find((a: IAttribute) =>
        a.name.toLowerCase() === attrName.toLowerCase()
      );

      if (attr && tarObj && tarObj.data) {
        if (!u.cmd.args[2]) {
          data.attributes = (data?.attributes || []).filter(
            (a: IAttribute) => a.name !== attr.name
          );
          await tarObj.save();
          return send(
            [u.socketId || ""],
            `%chGame>%cn  ${tarObj.name}'s attribute %ch${attr.name.toUpperCase()}%cn removed.`
          );
        } else {
          attr.value  = u.cmd.args[2];
          attr.setter = en.dbref;
          if (slashIdx !== -1) attr.type = typeHint;
          await tarObj.save();
          return send(
            [u.socketId || ""],
            `%chGame>%cn  ${tarObj.name}'s attribute %ch${attr.name.toUpperCase()}%cn set.`
          );
        }
      } else if (!attr && tarObj && tarObj.data) {
        data.attributes ||= [];
        data.attributes.push({
          name:   attrName,
          value:  u.cmd.args[2],
          setter: en.dbref,
          type:   typeHint,
        });
        await tarObj.save();
        return send(
          [u.socketId || ""],
          `%chGame>%cn  ${tarObj.name}'s attribute %ch${attrName.toUpperCase()}%cn set.`
        );
      }
    },
  });
};
