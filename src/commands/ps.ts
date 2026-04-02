import { addCmd } from "../services/commands/index.ts";
import { isStaff } from "../utils/index.ts";
import { queue } from "../services/Queue/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";

/**
 * @ps — list queued processes on the time-delay and semaphore queues.
 * Switches: /brief (default), /long, /summary, /all
 */
export default () =>
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
    exec: async (u: IUrsamuSDK) => {
      const sw  = (u.cmd.args[0] ?? "").toLowerCase().trim();
      const ref = (u.cmd.args[1] ?? "").trim();
      const staff = isStaff(u.me.flags);

      const wantAll     = sw === "all";
      const wantLong    = sw === "long";
      const wantSummary = sw === "summary";

      if ((wantAll || ref) && !staff) {
        return send([u.socketId ?? ""], "Permission denied.");
      }

      let executorId: string | undefined = u.me.id;
      if (wantAll) {
        executorId = undefined;
      } else if (ref) {
        const found = (await dbojs.query({ id: ref }))[0];
        if (!found) return send([u.socketId ?? ""], `No object "${ref}" found.`);
        executorId = found.id;
      }

      const [timeEntries, semEntries] = await Promise.all([
        queue.list(executorId),
        queue.listSemaphore(executorId),
      ]);

      const total = timeEntries.length + semEntries.length;

      if (wantSummary) {
        u.send(`%chQueue:%cn ${timeEntries.length} time-delayed, ${semEntries.length} semaphore-blocked (total: %ch${total}%cn)`);
        return;
      }

      if (total === 0) {
        u.send("No queued processes.");
        return;
      }

      const now = Date.now();
      u.send(u.util.center(" Process Queue ", 78, "-"));

      for (const e of timeEntries) {
        const secs = Math.max(0, Math.ceil((e.scheduledAt - now) / 1000));
        const cmd  = e.command.length > 50 ? e.command.slice(0, 47) + "..." : e.command;
        if (wantLong) {
          u.send(`%chPID:%cn ${e.pid}  %ch[%cn${secs}s%ch]%cn  exec:#${e.executor}  enact:#${e.enactor}  ${cmd}`);
        } else {
          u.send(`%chPID:%cn ${e.pid}  %ch[%cn${secs}s%ch]%cn  #${e.executor}: ${cmd}`);
        }
      }

      for (const e of semEntries) {
        const cmd = e.command.length > 50 ? e.command.slice(0, 47) + "..." : e.command;
        if (wantLong) {
          u.send(`%chPID:%cn ${e.pid}  %ch[SEM:#${e.semaphoreId}]%cn  exec:#${e.executor}  enact:#${e.enactor}  ${cmd}`);
        } else {
          u.send(`%chPID:%cn ${e.pid}  %ch[SEM:#${e.semaphoreId}]%cn  #${e.executor}: ${cmd}`);
        }
      }

      u.send(u.util.ljust("", 78, "-"));
      u.send(`%chTotal:%cn ${timeEntries.length} time-delayed, ${semEntries.length} semaphore-blocked`);
    },
  });
