import { addCmd } from "../services/commands/index.ts";
import { isStaff } from "../utils/index.ts";
import { queue } from "../services/Queue/index.ts";
import { dbojs } from "../services/Database/index.ts";
import { send } from "../services/broadcast/index.ts";
import { resolveFormat } from "../utils/resolveFormat.ts";
import { hydrate } from "../utils/evaluateLock.ts";
import type { IUrsamuSDK } from "../@types/UrsamuSDK.ts";
import type { FormatSlot } from "../utils/formatHandlers.ts";

/**
 * Two-tier format lookup: check `#0` (root) for game-wide skin first, then
 * the enactor (`u.me`) for per-player skin. Returns null if neither yields
 * a non-null override.
 */
async function resolveGlobalFormat(
  u: IUrsamuSDK,
  slot: FormatSlot,
  defaultArg: string,
): Promise<string | null> {
  const root = await dbojs.queryOne({ id: "0" });
  if (root) {
    const rootObj = hydrate(root as unknown as Parameters<typeof hydrate>[0]);
    const out = await resolveFormat(u, rootObj, slot, defaultArg);
    if (out != null) return out;
  }
  return await resolveFormat(u, u.me, slot, defaultArg);
}

export async function execPs(u: IUrsamuSDK): Promise<void> {
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

      // Build rows. Each row's default text is " <pid> <wait> <executor> <cmd> ".
      type Row = { defaultText: string; pid: number };
      const rows: Row[] = [];

      for (const e of timeEntries) {
        const secs = Math.max(0, Math.ceil((e.scheduledAt - now) / 1000));
        const cmd  = e.command.length > 50 ? e.command.slice(0, 47) + "..." : e.command;
        const defaultText = wantLong
          ? `%chPID:%cn ${e.pid}  %ch[%cn${secs}s%ch]%cn  exec:#${e.executor}  enact:#${e.enactor}  ${cmd}`
          : `%chPID:%cn ${e.pid}  %ch[%cn${secs}s%ch]%cn  #${e.executor}: ${cmd}`;
        rows.push({ defaultText, pid: e.pid });
      }

      for (const e of semEntries) {
        const cmd = e.command.length > 50 ? e.command.slice(0, 47) + "..." : e.command;
        const defaultText = wantLong
          ? `%chPID:%cn ${e.pid}  %ch[SEM:#${e.semaphoreId}]%cn  exec:#${e.executor}  enact:#${e.enactor}  ${cmd}`
          : `%chPID:%cn ${e.pid}  %ch[SEM:#${e.semaphoreId}]%cn  #${e.executor}: ${cmd}`;
        rows.push({ defaultText, pid: e.pid });
      }

      // Per-row format override.
      const renderedRows: string[] = [];
      for (const r of rows) {
        const rowOverride = await resolveGlobalFormat(u, "PSROWFORMAT", r.defaultText);
        renderedRows.push(rowOverride != null ? rowOverride : r.defaultText);
      }

      const headerLine = u.util.center(" Process Queue ", 78, "-");
      const footerLine = u.util.ljust("", 78, "-");
      const totalLine = `%chTotal:%cn ${timeEntries.length} time-delayed, ${semEntries.length} semaphore-blocked`;

      // Default-rendered full block, used as %0 for PSFORMAT.
      const defaultBlock = [headerLine, ...renderedRows, footerLine, totalLine].join("\n");

      const blockOverride = await resolveGlobalFormat(u, "PSFORMAT", defaultBlock);
      if (blockOverride != null) {
        u.send(blockOverride);
        return;
      }

      u.send(headerLine);
      for (const line of renderedRows) u.send(line);
      u.send(footerLine);
      u.send(totalLine);
}

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

Format hooks: set @psformat / @psrowformat on #0 (game-wide) or self.

Examples:
  @ps                 List your own queued commands.
  @ps/all             List all queued commands (admin+).
  @ps/summary         Show queue totals only.
  @ps #5              Show queued commands for object #5 (admin+).`,
    exec: execPs,
  });

export { resolveGlobalFormat };
