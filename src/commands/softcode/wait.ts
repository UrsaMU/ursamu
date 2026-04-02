import { addCmd } from "../../services/commands/index.ts";
import { dbojs } from "../../services/Database/index.ts";
import { isStaff } from "../../utils/index.ts";
import { target } from "../../utils/target.ts";
import { queue } from "../../services/Queue/index.ts";
import type { IDBOBJ } from "../../@types/IDBObj.ts";
import type { IUrsamuSDK } from "../../@types/UrsamuSDK.ts";

addCmd({
  name: "@wait",
  pattern: /^@wait\s+(\S+)\s*=\s*(.*)/i,
  lock: "connected",
  category: "Softcode",
  help: `@wait <seconds>=<command>
@wait <object>=<command>

Delay <command> by <seconds>, or block it until <object> is @notify'd.

Time form:    @wait 30=say Hello  (executes after 30 seconds, max 3600)
Semaphore:    @wait #5=say Done   (executes when #5 receives @notify)

Use @ps to inspect queued commands. Use @halt to cancel time-queued commands.
Use @drain to discard semaphore-blocked commands.

Examples:
  @wait 5=say Five seconds have passed.
  @wait here=say The room was notified.`,
  exec: async (u: IUrsamuSDK) => {
    const MAX_WAIT = 3600;
    const token = (u.cmd.args[0] ?? "").trim();
    const cmd   = (u.cmd.args[1] ?? "").trim();
    if (!cmd) return u.send("Usage: @wait <seconds|object>=<command>");

    const seconds = parseInt(token, 10);
    if (!isNaN(seconds) && /^\d+$/.test(token)) {
      if (seconds < 0) return u.send("Wait time cannot be negative.");
      if (seconds > MAX_WAIT) return u.send(`Wait time cannot exceed ${MAX_WAIT} seconds.`);
      const pid = await queue.enqueue(
        { command: cmd, executor: u.me.id, enactor: u.me.id },
        seconds * 1000,
      );
      u.send(`Wait ${seconds}s: ${cmd} (PID: ${pid})`);
      return;
    }

    const en = await dbojs.queryOne({ id: u.me.id });
    if (!en) return;
    const sem = await target(en as unknown as IDBOBJ, token);
    if (!sem) return u.send(`I can't find semaphore object '${token}'.`);

    const staff      = isStaff(u.me.flags);
    const semOwner   = (sem.data?.owner as string | undefined);
    const semOwnedByMe = semOwner === u.me.id || sem.id === u.me.id;
    if (!semOwnedByMe && !staff) {
      return u.send("Permission denied. You can only @wait on objects you control.");
    }

    const pid = await queue.enqueueSemaphore(
      { command: cmd, executor: u.me.id, enactor: u.me.id },
      sem.id,
    );
    u.send(`Waiting on #${sem.id}: ${cmd} (PID: ${pid})`);
  },
});
