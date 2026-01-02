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
      if (!ctx.socket.cid) return;
      const en = await dbojs.queryOne({ id: ctx.socket.cid });
      if (!en) return;

      const tar = await target(en, args[0]);
      if (!tar) {
        return send([ctx.socket.id], "I don't see that here.");
      }
      
      
      const loc = tar.location ? await dbojs.queryOne({ id: tar.location }) : null;
      if (en && tar && ((await canEdit(en, tar)) || tar.flags.includes("visual"))) {
        delete tar.data?.password;
        let output = `%chName:%cn ${tar.data?.name}${
          tar.data?.alias ? "(" + (tar.data?.alias as string).toUpperCase() + ")" : ""
        }\n`;
        output += `%ch_ID:%cn ${tar.id}\n`;
        output += `%chDBREF:%cn #${tar.id}\n`;
        output += `%chFLAGS:%cn ${tar.flags}\n`;
        const canSeeLoc = loc ? await canEdit(en, loc) : false;
        output += `%chLOCATION%cn ${loc ? displayName(en, loc, canSeeLoc) : "None?!"}\n`;
        tar.data ||= {};
        if (tar.data.owner) output += `%chOwner:%cn ${tar.data.owner}\n`;
        if (tar.data.lock) output += `%chLock:%cn ${tar.data.lock}\n`;
        
        // Attributes
        if (tar.data.attributes) {
            output += "%chAttributes:%cn\n";
            for (const attr of tar.data.attributes) {
                 output += `  %ch${attr.name.toUpperCase()}:%cn ${attr.value}\n`;
            }
        }

        return send([ctx.socket.id], output);
      }
      send([ctx.socket.id], "You can't examine that.");
    },
  });
};
