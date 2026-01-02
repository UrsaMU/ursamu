import { Obj } from "../services/DBObjs/index.ts";
import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { canEdit } from "../utils/canEdit.ts";
import { target } from "../utils/target.ts";
import { set } from "../../deps.ts";

export default () => {
  addCmd({
    name: "@set",
    pattern: /^[@\+]?set\s+(.*)\/(.*)\s*=\s*(.*)?$/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const [t, k, v] = args;
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, t, true);
      if (!tar) return send([ctx.socket.id], "I don't see that here.");
      const tarObj = await Obj.get(tar.id);
      if (!tarObj?.dbobj)
        return send([ctx.socket.id], "I don't see that here.");

      if (await canEdit(en, tarObj.dbobj)) {
        tarObj.dbobj.data ||= {};

        if (v === undefined) {
          delete tarObj.dbobj.data[k];
          await tarObj.save();
          return send(
            [ctx.socket.id],
            `%chGame>%cn Deleted %ch${k}%cn on ${tarObj.name}.`
          );
        }

        tarObj.dbobj.data = set(tarObj.dbobj.data, k, v);
        await tarObj.save();
        send(
          [ctx.socket.id],
          `%chGame>%cn Set %ch${k}%cn to %ch${v}%cn on ${tarObj.name}.`
        );
      }
    },
  });

  addCmd({
    name: "&",
    pattern: /^&(\w+)\s+([^=]+)\s*=\s*(.*)?$/i,
    lock: "connected admin+",
    exec: async (ctx, args) => {
      const [attr, targetName, value] = args;
      // Redirect to @set logic: @set target/attr=value
      // We can just reuse the logic or call the exec function if we extracted it.
      // For now, let's just duplicate the core logic or re-route.
      // Since @set expects "target/attr", we can construct that if we use the same handler,
      // but simpler to just implement the logic directly here using the same internal steps.
      
      const en = await Obj.get(ctx.socket.cid);
      if (!en) return;

      const tar = await target(en, targetName.trim(), true);
      if (!tar) return send([ctx.socket.id], "I don't see that here.");
      const tarObj = await Obj.get(tar.id);
      if (!tarObj?.dbobj)
        return send([ctx.socket.id], "I don't see that here.");

      if (await canEdit(en, tarObj.dbobj)) {
        tarObj.dbobj.data ||= {};
        const key = attr.toUpperCase(); // Standardize attribute names to upper case? Or keep case? MUX usually uppercases.

        if (value === undefined || value.trim() === "") {
          // If value is empty, do we delete? standard MUX behaviour varies, usually setting empty string.
          // But usually &attr obj=  sets it to empty string.
          // Deletion is usually done via @set obj/attr=
          // Let's set it to the value provided.
           tarObj.dbobj.data = set(tarObj.dbobj.data, key, value || "");
           await tarObj.save();
           send(
            [ctx.socket.id],
            `%chGame>%cn Set %ch${key}%cn on ${tarObj.name}.`
          );
        } else {
            tarObj.dbobj.data = set(tarObj.dbobj.data, key, value);
            await tarObj.save();
            send(
            [ctx.socket.id],
            `%chGame>%cn Set %ch${key}%cn to %ch${value}%cn on ${tarObj.name}.`
            );
        }
      } else {
          send([ctx.socket.id], "Permission denied.");
      }
    }
  });
};
