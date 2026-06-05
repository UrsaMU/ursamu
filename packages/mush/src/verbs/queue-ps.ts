import type { IUrsamuSDK } from "../commands/types.ts";
import { queue, send } from "@ursamu/core";
import { dbojs } from "../world/dbobjs.ts";
import { resolveGlobalFormat } from "../format/handlers.ts";

export async function execPs(u: IUrsamuSDK): Promise<void> {
  const sw = (u.cmd.args[0] ?? "").toLowerCase().trim();
  const ref = (u.cmd.args[1] ?? "").trim();
  const staff =
    u.me.flags.has("admin") || u.me.flags.has("wizard") || u.me.flags.has("superuser");

  const wantAll = sw === "all";
  const wantLong = sw === "long";
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
    u.send(
      `%chQueue:%cn ${timeEntries.length} time-delayed, ${semEntries.length} semaphore-blocked (total: %ch${total}%cn)`,
    );
    return;
  }

  if (total === 0) {
    u.send("No queued processes.");
    return;
  }

  const now = Date.now();
  type Row = { defaultText: string; pid: number };
  const rows: Row[] = [];

  for (const e of timeEntries) {
    const secs = Math.max(0, Math.ceil((e.scheduledAt - now) / 1000));
    const cmd = e.command.length > 50 ? e.command.slice(0, 47) + "..." : e.command;
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

  const renderedRows: string[] = [];
  for (const r of rows) {
    const rowOverride = await resolveGlobalFormat(u, "PSROWFORMAT", r.defaultText);
    renderedRows.push(rowOverride != null ? rowOverride : r.defaultText);
  }

  const headerLine = u.util.center(" Process Queue ", 78, "-");
  const footerLine = u.util.ljust("", 78, "-");
  const totalLine =
    `%chTotal:%cn ${timeEntries.length} time-delayed, ${semEntries.length} semaphore-blocked`;
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
