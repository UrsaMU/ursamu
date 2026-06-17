import { addCmd } from "../commands/addCmd.ts";
import type { IUrsamuSDK } from "../commands/types.ts";
import { queue, send } from "@ursamu/core";
import { dbojs } from "../world/dbobjs.ts";
import { execPs } from "./queue-ps.ts";

function isStaff(flags: Set<string>): boolean {
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

addCmd({
  name: "@ps",
  pattern: /^@ps(?:\/([\w]+))?\s*(.*)?/i,
  lock: "connected",
  category: "Softcode",
  help: `@ps[/<switch>] [<object>]

List commands queued on the time-delay and semaphore queues.
Without an argument, shows your own queued commands.
With <object> (admin+), shows that object's queued commands.

Switches:
  /brief    (default) PID, wait remaining, executor dbref, command
  /long     Also shows enactor dbref
  /summary  Totals only — no individual entries
  /all      Show every process on the server (admin+)

Examples:
  @ps                 List your own queued commands.
  @ps/all             List all queued commands (admin+).
  @ps/summary         Show queue totals only.
  @ps #5              Show queued commands for object #5 (admin+).`,
  exec: execPs,
});

addCmd({
  name: "@halt",
  pattern: /^@halt(?:\s+(.+))?$/i,
  lock: "connected",
  category: "Softcode",
  help: `@halt [<object>]  — Cancel all queued @wait actions for an object.

Without an argument, cancels your own queue. Admin+ may target any object
by dbref or name.

Examples:
  @halt
  @halt #12`,
  exec: async (u: IUrsamuSDK) => {
    const staff = isStaff(u.me.flags);
    const ref = (u.cmd.args[0] || "").trim();

    let targetId = u.me.id;
    if (ref) {
      if (!staff) return send([u.socketId || ""], "Permission denied.");
      const found = (await dbojs.query({ id: ref }))[0];
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
    const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
    const ref = (u.cmd.args[1] ?? "").trim();
    const rawN = (u.cmd.args[2] ?? "").trim();

    if (!ref) return u.send("Usage: @notify[/all] <object>[=<count>]");

    const staff = isStaff(u.me.flags);
    const found =
      (await dbojs.query({ id: ref }))[0] ??
      (await dbojs.query({ "data.name": ref }))[0];
    if (!found) return send([u.socketId ?? ""], `I can't find '${ref}'.`);

    const isOwner =
      (found.data?.owner as string | undefined) === u.me.id || found.id === u.me.id;
    if (!isOwner && !staff) return u.send("Permission denied.");

    const wantAll = sw === "all";
    let count: number;

    if (wantAll) {
      count = Math.max(1, await queue.countSemaphore(found.id));
    } else {
      count = rawN ? Math.max(1, parseInt(rawN, 10)) : 1;
      if (isNaN(count)) return u.send("Count must be a positive integer.");
    }

    const released = await queue.notifySemaphore(found.id, count);
    if (released === 0) {
      u.send(`No blocked commands on #${found.id}. Pre-notify stored (${count}).`);
    } else {
      u.send(
        `Released ${released} command${released === 1 ? "" : "s"} waiting on #${found.id}.`,
      );
    }
  },
});

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
    const quiet = (u.cmd.args[0] ?? "").toLowerCase() === "quiet";
    const ref = (u.cmd.args[1] ?? "").trim();
    const staff = isStaff(u.me.flags);

    let targetId = u.me.id;
    if (ref) {
      if (!staff) return send([u.socketId ?? ""], "Permission denied.");
      const found =
        (await dbojs.query({ id: ref }))[0] ??
        (await dbojs.query({ "data.name": ref }))[0];
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
        u.send(
          `Drained: ${timeCancelled} time-delayed, ${semCancelled} semaphore-blocked (total: ${total}).`,
        );
      }
    }
  },
});
