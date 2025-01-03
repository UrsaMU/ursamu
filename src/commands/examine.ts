import { getCharacter } from "../plugins/wod/services";
import { Obj } from "../services";
import { dbojs } from "../services/Database";
import { send } from "../services/broadcast";

import { addCmd } from "../services/commands";
import { canEdit } from "../utils/canEdit";
import { displayName } from "../utils/displayName";
import { target } from "../utils/target";

export default () => {
  addCmd({
    name: "examine",
    pattern: /^e[xamine]+\s+(.*)$/i,
    lock: "connected builder+",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, args[0]);
      const loc = await Obj.get(tar?.location);

      if (en && tar && canEdit(en, tar)) {
        delete tar.data?.password;
        let output = `%chName:%cn ${tar.data?.name}${
          tar.data?.alias ? "(" + tar.data?.alias.toUpperCase() + ")" : ""
        }\n`;
        output += `%ch_ID:%cn ${tar._id}\n`;
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
