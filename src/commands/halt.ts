import { addCmd } from "../services/commands/index.ts";
import { queue } from "../services/Queue/index.ts";
import { send } from "../services/broadcast/index.ts";
import { dbojs } from "../services/Database/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@halt",
    pattern: /^@halt(?:\s+(.+))?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");
      const ref = (u.cmd.args[0] || "").trim();

      let targetId = u.me.id;
      if (ref) {
        if (!isStaff) return send([u.socketId || ""], "Permission denied.");
        const results = await dbojs.query({ id: ref });
        const found = results[0];
        if (!found) return send([u.socketId || ""], `No object "${ref}" found.`);
        targetId = found.id;
      }

      const count = await queue.cancelAll(targetId);
      if (count === 0) {
        send([u.socketId || ""], "No queued actions to halt.");
      } else {
        send([u.socketId || ""], `Halted ${count} queued action${count === 1 ? "" : "s"}.`);
      }
    },
  });
};
