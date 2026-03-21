import { addCmd } from "../services/commands/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { getAttribute } from "../utils/getAttribute.ts";
import { sandboxService } from "../services/Sandbox/SandboxService.ts";
import { splitArgs } from "../utils/splitArgs.ts";
import { send } from "../services/broadcast/index.ts";
import { target } from "../utils/target.ts";
import { queue } from "../services/Queue/index.ts";
import type { IDBOBJ } from "../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

export default () => {
  addCmd({
    name: "@trigger",
    pattern: /^@tr(?:igger)?\s+([^/]+)\/([^=]+)(?:=(.*))?$/i,
    lock: "connected",
    exec: async (u: IUrsamuSDK) => {
      const en = await dbojs.queryOne({ id: u.me.id });
      if (!en) return;

      const tarName = u.cmd.args[0];
      if (!u.cmd.args[1]) {
        u.send("Usage: @trigger <object>/<attribute>");
        return;
      }
      const attrName = u.cmd.args[1].toUpperCase();
      const triggerArgsRaw = u.cmd.args[2] || "";

      const tar = await target(en as unknown as IDBOBJ, tarName);
      if (!tar) return send([u.socketId || ""], "I can't find that here!");

      const attr = await getAttribute(tar, attrName);
      if (!attr) return send([u.socketId || ""], `Attribute ${attrName} not found on ${tarName}.`);

      const evalArgs = splitArgs(triggerArgsRaw).map((a) => a.trim());

      try {
        await sandboxService.runScript(attr.value, {
          id: tar.id,
          location: tar.location || "limbo",
          // deno-lint-ignore no-explicit-any
          state: (tar as any).data?.state || {},
          target: evalArgs[0] ? { id: evalArgs[0] } : undefined,
        });
      } catch (err) {
        send([u.socketId || ""], `%chGame>%cn Script error on ${tarName}/${attrName}: ${err instanceof Error ? err.message : String(err)}`);
        return;
      }

      send([u.socketId || ""], `Triggered script on ${tarName}/${attrName}.`);
    },
  });

  addCmd({
    name: "@wait",
    pattern: /^@wait\s+(\d+)\s*=\s*(.*)/i,
    lock: "connected",
    exec: (u: IUrsamuSDK) => {
      const MAX_WAIT = 3600; // 1 hour cap
      const seconds = parseInt(u.cmd.args[0]);
      const cmd = u.cmd.args[1];
      if (isNaN(seconds) || seconds < 0)
        return send([u.socketId || ""], "Invalid time.");
      if (seconds > MAX_WAIT)
        return send([u.socketId || ""], `Wait time cannot exceed ${MAX_WAIT} seconds.`);

      queue
        .enqueue(
          {
            command: cmd,
            executor: u.me.id,
            enactor: u.me.id,
            data: {},
          },
          seconds * 1000
        )
        .then((pid) => {
          send([u.socketId || ""], `Wait ${seconds}s: ${cmd} (PID: ${pid})`);
        });
    },
  });
};
