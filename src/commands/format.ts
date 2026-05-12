import { addCmd, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

const addFormatCommand = (cmdName: string, attrName: string) => {
  addCmd({
    name: cmdName,
    pattern: new RegExp(`^${cmdName}\\s+([^=]+)(?:\\s*=\\s*(.*))?$`, "i"),
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await Obj.get(u.me.id);
      if (!en) return;

      const tar = await target(en.dbobj, u.cmd.args[0]);
      if (!tar) return send([u.socketId || ""], "%chGame>%cn Target not found.");

      if (!await canEdit(en.dbobj, tar)) {
        return send([u.socketId || ""], "%chGame>%cn Permission denied.");
      }

      const tarObj = new Obj(tar);
      const format = u.cmd.args[1];

      // deno-lint-ignore no-explicit-any
      const data = tarObj.data as any;
      if (!data?.attributes) data.attributes = [];

      data.attributes = data.attributes.filter(
        (a: IAttribute) => a.name !== attrName
      );

      if (format) {
        data.attributes.push({
          name: attrName,
          value: format,
          setter: en.dbref,
          type: "attribute",
        });
        await tarObj.save();
        send([u.socketId || ""], `%chGame>%cn Set ${cmdName} on ${tarObj.name}.`);
      } else {
        await tarObj.save();
        send([u.socketId || ""], `%chGame>%cn Cleared ${cmdName} on ${tarObj.name}.`);
      }
    },
  });
};

addFormatCommand("@nameformat", "NAMEFORMAT");
addFormatCommand("@descformat", "DESCFORMAT");
addFormatCommand("@conformat", "CONFORMAT");
addFormatCommand("@exitformat", "EXITFORMAT");
