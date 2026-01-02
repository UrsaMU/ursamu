import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";

export default () => {
  addCmd({
    name: "@edit",
    pattern: /^@edit\s+(.*)\/(.*)\s*=\s*(.*)\/(.*)/i,
    lock: "connected",
    exec: async (ctx, args) => {
      // args: [obj, attr, old, new]
      const en = await dbojs.queryOne({ id: ctx.socket.cid! });
      if (!en) return;

      const objName = args[0];
      const attrName = args[1].toUpperCase();
      const findStr = args[2];
      const replaceStr = args[3];

      const tar = await target(en, objName);
      if (!tar) {
        return send([ctx.socket.id], "I can't find that here!", {});
      }

      if (!(await canEdit(en, tar))) {
        return send([ctx.socket.id], "Permission denied.", {});
      }

      const attr = await getAttribute(tar, attrName);
      if (!attr) {
        return send(
          [ctx.socket.id],
          `Attribute ${attrName} not found on ${objName}.`,
          {}
        );
      }

      // Perform replacement
      // Simple string replace or global? MUX @edit matches FIRST occurance usually, unless global flag?
      // MUX Help says: "Searches for the first occurrence of <old string> in <attribute> and replaces it with <new string>."
      // We will follow MUX behavior: First occurrence.
      
      const val = attr.value;
      if (!val.includes(findStr)) {
          return send([ctx.socket.id], `String '${findStr}' not found in ${attrName}.`, {});
      }
      
      const newVal = val.replace(findStr, replaceStr);
      
      // Update attribute
      // Using `force` to call `@set`? Or update DB directly?
      // Updating DB directly ensures we handle it cleanly.
      // But we need to handle attribute structure (case sensitive key?).
      // `getAttribute` returns `{ key: string, value: string, ... }`.
      
      // We'll rely on `canEdit` which we checked.
      // We should use `@set` logic to ensure uniformity (hooks?).
      // Constructing command: &ATTR OBJ=VAL
      // But VAL might contain special chars.
      // Safer to update DB directly if we duplicate `set` logic or import it.
      // `commands/set.ts` isn't exporting setup logic function.
      
      // Let's modify object directly.
      tar.data ||= {};
      tar.data.attributes ||= [];
      const attrs = tar.data.attributes;
      
      const idx = attrs.findIndex(a => a.name.toUpperCase() === attrName);
      if (idx !== -1) {
          attrs[idx].value = newVal;
          await dbojs.modify({ id: tar.id }, "$set", tar);
          send([ctx.socket.id], `Set - ${attrName}: ${newVal}`, {});
      }
    },
  });
};
