import { Obj } from "../index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { displayName } from "../utils/displayName.ts";
import { target } from "../utils/target.ts";

export default () => {
  addCmd({
    name: "examine",
    pattern: /^e[xamine]+\s+(.*)$/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, args[0]);
      const loc = await dbojs.queryOne({ id: tar?.location });
      if (en && tar && canEdit(en, tar)) {
        delete tar.data?.password;
        let output = `%chName:%cn ${tar.data?.name}${
          tar.data?.alias ? "(" + tar.data?.alias.toUpperCase() + ")" : ""
        }\n`;
        output += `%chDBREF:%cn #${tar.id}\n`;
        output += `%chFLAGS:%cn ${tar.flags}\n`;
        output += `%chLOCATION%cn ${loc ? displayName(en, loc) : "None?!"}\n`;
        tar.data ||= {};
        if (tar.data.owner) output += `%chOwner:%cn ${tar.data.owner}\n`;
        if (tar.data.lock) output += `%chLock:%cn ${tar.data.lock}\n`;
        output += `%chDATA:%cn ${JSON.stringify(tar.data, null, 4)}`;
        return send([ctx.socket.id], output);
      }
      send([ctx.socket.id], "You can't examine that.");
    },
  });
};
