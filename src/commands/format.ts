import { addCmd, send } from "../services/index.ts";
import { canEdit, target } from "../utils/index.ts";
import { Obj } from "../services/DBObjs/index.ts";
import type { IAttribute } from "../@types/IAttribute.ts";

const addFormatCommand = (
  cmdName: string,
  attrName: string
) => {
  addCmd({
    name: cmdName,
    pattern: new RegExp(`^${cmdName}\\s+([^=]+)(?:\\s*=\\s*(.*))?$`, "i"),
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en.dbobj, args[0]);
      if (!tar) return send([ctx.socket.id], "%chGame>%cn Target not found.");

      if (!await canEdit(en.dbobj, tar)) {
        return send([ctx.socket.id], "%chGame>%cn Permission denied.");
      }

      const tarObj = new Obj(tar);
      const format = args[1];

      // deno-lint-ignore no-explicit-any
      const data = tarObj.data as any;
      data.attributes ||= [];

      // Remove existing attribute
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
        send([ctx.socket.id], `%chGame>%cn Set ${cmdName} on ${tarObj.name}.`);
      } else {
        await tarObj.save();
        send([ctx.socket.id], `%chGame>%cn Cleared ${cmdName} on ${tarObj.name}.`);
      }
    },
  });
};

export default () => {
    addFormatCommand("@nameformat", "NAMEFORMAT");
    addFormatCommand("@descformat", "DESCFORMAT");
    addFormatCommand("@conformat", "CONFORMAT");
    addFormatCommand("@exitformat", "EXITFORMAT");
};
