import { addCmd } from "../services/commands/index.ts";
import { queue } from "../services/Queue/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * @notify — release semaphore-blocked commands for an object.
 * If no blocked commands exist, stores a pre-notify (future @wait fires immediately).
 */
export default () =>
  addCmd({
    name: "@notify",
    pattern: /^@notify(?:\/([\w]+))?\s*(.*?)(?:=(\d+))?$/i,
    lock: "connected",
    category: "Softcode",
    help: `@notify[/all] <object>[=<count>]

Release semaphore-blocked commands waiting on <object>.

Without =<count>, releases one blocked command. With =<count>, releases
that many. If no commands are blocked, stores pre-notifies: future
@wait <object>=<cmd> calls will fire immediately instead of blocking.

With /all, releases every blocked command regardless of count.

Examples:
  @notify here              Release one command waiting on this room.
  @notify me=3              Release three commands waiting on yourself.
  @notify/all #5            Release all commands waiting on object #5.`,
    exec: async (u: IUrsamuSDK) => {
      const sw    = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const ref   = (u.cmd.args[1] ?? "").trim();
      const rawN  = (u.cmd.args[2] ?? "").trim();

      if (!ref) return u.send("Usage: @notify[/all] <object>[=<count>]");

      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

      // Resolve the semaphore object
      const found = (await dbojs.query({ id: ref }))[0]
        ?? (await dbojs.query({ "data.name": ref }))[0];
      if (!found) return send([u.socketId ?? ""], `I can't find '${ref}'.`);

      // Only the owner or staff can notify on an object
      const isOwner = (found.data?.owner as string | undefined) === u.me.id || found.id === u.me.id;
      if (!isOwner && !isStaff) return u.send("Permission denied.");

      const wantAll = sw === "all";
      let count: number;

      if (wantAll) {
        // Count only entries blocked on this specific semaphore (scoped scan).
        count = Math.max(1, await queue.countSemaphore(found.id));
      } else {
        count = rawN ? Math.max(1, parseInt(rawN, 10)) : 1;
        if (isNaN(count)) return u.send("Count must be a positive integer.");
      }

      const released = await queue.notifySemaphore(found.id, count);
      if (released === 0) {
        u.send(`No blocked commands on #${found.id}. Pre-notify stored (${count}).`);
      } else {
        u.send(`Released ${released} command${released === 1 ? "" : "s"} waiting on #${found.id}.`);
      }
    },
  });
