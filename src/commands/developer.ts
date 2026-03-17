import { send } from "../services/broadcast/index.ts";
import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { sign } from "../services/jwt/index.ts";
import { target } from "../utils/target.ts";
import { canEdit } from "../utils/canEdit.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@edit",
    pattern: /^@edit\s+(.*)/i,
    lock: "connected",
    help: "Edit an attribute on the web",
    category: "developer",
    exec: async (u: IUrsamuSDK) => {
      const raw = u.cmd.args[0];
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const parts = raw.split("/");
      if (parts.length === 1) {
        return send([u.socketId || ""], "Usage: @edit <object>/<attribute>");
      }

      const targetName = parts[0];
      const attrName = parts.slice(1).join("/");

      const obj = await target(en, targetName, true);
      if (!obj) return send([u.socketId || ""], `Could not find ${targetName}.`);
      if (!await canEdit(en, obj)) return send([u.socketId || ""], "Permission denied.");

      const token = await sign({
        id: en.id,
        scope: "edit",
        target: obj.id,
        attr: attrName,
        exp: Date.now() + 1000 * 60 * 15,
      });

      const url = `http://localhost:8000/edit?token=${token}&dbref=${obj.id}&attr=${attrName}`;
      send([u.socketId || ""], `Edit Link (expires in 15m): %ch%cb${url}%cn`);
    },
  });
};
