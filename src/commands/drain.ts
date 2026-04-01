import { addCmd } from "../services/commands/index.ts";
import { queue } from "../services/Queue/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * @drain — discard all commands waiting on a semaphore object.
 * Without semaphore support: acts as @halt for a named object.
 * With semaphore support: also clears the semaphore queue and pre-notify counter.
 */
export default () =>
  addCmd({
    name: "@drain",
    pattern: /^@drain(?:\/(quiet))?\s*(.*)?/i,
    lock: "connected",
    category: "Softcode",
    help: `@drain[/quiet] [<object>]

Discard all commands waiting on the semaphore queue for <object> and reset
its pre-notify counter to zero. Also cancels any time-delayed commands
queued by that object.

Without an argument, drains your own queued commands.
With <object> (admin+ to drain others), drains that object's queue.

Switches:
  /quiet    Suppress the confirmation message.

Examples:
  @drain           Cancel all your own queued commands.
  @drain here      Drain the semaphore queue on the current room (admin+).
  @drain #5        Drain all queued commands for object #5 (admin+).`,
    exec: async (u: IUrsamuSDK) => {
      const quiet   = (u.cmd.args[0] ?? "").toLowerCase() === "quiet";
      const ref     = (u.cmd.args[1] ?? "").trim();
      const isStaff = u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

      let targetId = u.me.id;
      if (ref) {
        if (!isStaff) return send([u.socketId ?? ""], "Permission denied.");
        const found = (await dbojs.query({ id: ref }))[0]
          ?? (await dbojs.query({ "data.name": ref }))[0];
        if (!found) return send([u.socketId ?? ""], `I can't find '${ref}'.`);
        targetId = found.id;
      }

      const [timeCancelled, semCancelled] = await Promise.all([
        queue.cancelAll(targetId),
        queue.drainSemaphore(targetId),
      ]);

      const total = timeCancelled + semCancelled;
      if (!quiet) {
        if (total === 0) {
          u.send("No queued actions to drain.");
        } else {
          u.send(`Drained: ${timeCancelled} time-delayed, ${semCancelled} semaphore-blocked (total: ${total}).`);
        }
      }
    },
  });
