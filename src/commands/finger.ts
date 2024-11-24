import { addCmd } from "../services/commands";
import { send } from "../services/broadcast";
import { Obj } from "../services/DBObjs/DBObjs";
import { center, repeatString } from "../utils/format";
import { displayName } from "../utils/displayName";
import { isAdmin } from "../utils/isAdmin";
import { target } from "../utils/target";
import { capString } from "../utils";

export default () =>
  addCmd({
    name: "finger",
    pattern: /^[@\+]?finger(?:\s*(.*))?$/i,
    lock: "connected",
    exec: async (ctx, args) => {
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, args[0]);
      if (!tar) return send([en.dbref], "I can't find that player.");

      let output = center(`%cy[%cn %ch+FINGER%cn ${displayName(en, tar)} %cy]%cn`, 78, "%cr=%cn") + "\n";
      const exclude = [
        "finger.full_name",
        "finger.pronouns",
        "finger.position",
        "finger.status",
        "finger.public_email",
        "finger.rp_prefs",
      ];
      
      // admin info
      if (await isAdmin(en)) {
        output += `%chLast IP: %cn${tar.data?.lastIp || "None"}\n`;
        const lastLogin = tar.flags.includes("connected") ? "ONLINE" : new Date(tar.data?.lastLogin).toLocaleDateString('en-US') ;
        output += `%chLast Login: %cn${lastLogin}\n`;
        output +=  repeatString("%cr-%cn", 78) + "\n";
      }
      
      // search for finger.<attr>s that are in the exclude list.  Sorr by the exlude list.
      for (const attr of exclude) {
        const stat = tar.data?.attributes?.find((s) => s.name === attr);
        if (stat) {
          output += `%ch${capString(stat.name.slice(7).replace("_", " "))}: %cn${stat.value}\n`;
        }
      }

      // search for other finger.<attr>s that aren't in the exclude list
      for (const attr of tar.attributes) {
        if (attr.name.startsWith("finger.") && !exclude.includes(attr.name)) {
          output += `%ch${capString(attr.name.slice(7).replace("_", " "))}: %cn${attr.value}\n`;
        }
      }
      output += repeatString("%cr=%cn", 78) + "\n";
      await send([en.dbref], output);  
    }
  });
