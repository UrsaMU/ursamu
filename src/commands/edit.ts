import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

addCmd({
    name: "@edit",
    pattern: /^@edit\s+(.*)\/(.*)\s*=\s*(.*)\/(.*)/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const [objName, attrName, findStr, replaceStr] = u.cmd.args;

      const tar = await target(en, objName);
      if (!tar) return send([u.socketId || ""], "I can't find that here!");
      if (!await canEdit(en, tar)) return send([u.socketId || ""], "Permission denied.");

      const attr = await getAttribute(tar, attrName.toUpperCase());
      if (!attr) return send([u.socketId || ""], `Attribute ${attrName} not found on ${objName}.`);

      const val = attr.value;
      if (!val.includes(findStr))
        return send([u.socketId || ""], `String '${findStr}' not found in ${attrName}.`);

      const newVal = val.replaceAll(findStr, replaceStr);

      tar.data ||= {};
      tar.data.attributes ||= [];
      const attrs = tar.data.attributes as Array<{ name: string; value: string }>;
      const idx = attrs.findIndex((a) => a.name.toUpperCase() === attrName.toUpperCase());
      if (idx !== -1) {
        attrs[idx].value = newVal;
        await dbojs.modify({ id: tar.id }, "$set", tar);
        send([u.socketId || ""], `Set - ${attrName.toUpperCase()}: ${newVal}`);
      } else {
        send([u.socketId || ""], "Attribute not found.");
      }
    },
});
