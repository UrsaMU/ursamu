/**
 * Job meta switches: due, status, esc, hold, tag, access, delete.
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobs } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { JobEsc, JobProgress } from "./types.ts";
import { formatDate } from "./format.ts";
import { getJobByNumber } from "./job-utils.ts";
import { parseDue } from "./filter.ts";

async function doDue(u: IUrsamuSDK, arg: string): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/due <#>=<when>  (e.g. 3d, 12/25/26)");
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const when = arg.slice(eq + 1).trim();
  if (isNaN(num)) {
    u.send("Usage: +job/due <#>=<when>");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  if (when.toLowerCase() === "none" || when === "0") {
    job.dueAt = undefined;
  } else {
    const t = parseDue(when);
    if (t == null) {
      u.send(">JOBS: Could not parse due date.");
      return;
    }
    job.dueAt = t;
  }
  job.updatedAt = Date.now();
  await jobs.update({ id: job.id }, job);
  u.send(
    job.dueAt
      ? `>JOBS: Job #${num} due ${formatDate(job.dueAt)}.`
      : `>JOBS: Job #${num} due date cleared.`,
  );
}

async function doStatus(u: IUrsamuSDK, arg: string): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send(
      "Usage: +job/status <#>=<new|underway|hold|25|50|75|100>",
    );
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const st = arg.slice(eq + 1).trim().toLowerCase() as JobProgress;
  const ok = ["new", "underway", "hold", "25", "50", "75", "100"];
  if (isNaN(num) || !ok.includes(st)) {
    u.send(
      "Usage: +job/status <#>=<new|underway|hold|25|50|75|100>",
    );
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const old = job.status;
  job.progress = st;
  if (st === "hold") job.status = "open";
  else if (st === "new") job.status = "new";
  else job.status = "open";
  job.updatedAt = Date.now();
  await jobs.update({ id: job.id }, job);
  await jobHooks.emit("job:status-changed", job, old);
  u.send(`>JOBS: Job #${num} status → ${st}.`);
}

async function doEsc(u: IUrsamuSDK, arg: string): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/esc <#>=green|yellow|red");
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const col = arg.slice(eq + 1).trim().toLowerCase() as JobEsc;
  if (isNaN(num) || !["green", "yellow", "red"].includes(col)) {
    u.send("Usage: +job/esc <#>=green|yellow|red");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const old = job.priority ?? "normal";
  job.esc = col;
  job.priority =
    col === "red" ? "critical" : col === "yellow" ? "high" : "normal";
  job.updatedAt = Date.now();
  await jobs.update({ id: job.id }, job);
  await jobHooks.emit("job:priority-changed", job, old);
  u.send(`>JOBS: Job #${num} escalation → ${col}.`);
}

async function doHold(u: IUrsamuSDK, arg: string): Promise<void> {
  const num = parseInt(arg.trim(), 10);
  if (isNaN(num)) {
    u.send("Usage: +job/hold <#>");
    return;
  }
  await doStatus(u, num + "=hold");
}

async function doTag(u: IUrsamuSDK, arg: string): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/tag <#>=<player|tag>");
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const tag = arg.slice(eq + 1).trim();
  if (isNaN(num) || !tag) {
    u.send("Usage: +job/tag <#>=<player|tag>");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const target = await u.util.target(u.me, tag);
  const id = target?.id ?? tag;
  const tags = new Set(job.tags ?? []);
  if (tags.has(id)) tags.delete(id);
  else tags.add(id);
  job.tags = [...tags];
  job.updatedAt = Date.now();
  await jobs.update({ id: job.id }, job);
  u.send(`>JOBS: Job #${num} tags: ${job.tags.join(", ") || "(none)"}.`);
}

async function doAccess(u: IUrsamuSDK, arg: string): Promise<void> {
  // +job/access <#>=<player>
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/access <#>=<player>");
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const name = arg.slice(eq + 1).trim();
  if (isNaN(num) || !name) {
    u.send("Usage: +job/access <#>=<player>");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const target = await u.util.target(u.me, name);
  if (!target) {
    u.send(`>JOBS: Player "${name}" not found.`);
    return;
  }
  const list = new Set(job.additionalPlayers ?? []);
  if (list.has(target.id)) list.delete(target.id);
  else list.add(target.id);
  job.additionalPlayers = [...list];
  job.updatedAt = Date.now();
  await jobs.update({ id: job.id }, job);
  u.send(
    `>JOBS: Toggled access for ${target.name} on job #${num}.`,
  );
}

async function doDelete(u: IUrsamuSDK, arg: string): Promise<void> {
  if (!u.me.flags.has("wizard") && !u.me.flags.has("superuser")) {
    u.send(">JOBS: Wizard only.");
    return;
  }
  const num = parseInt(arg.trim(), 10);
  if (isNaN(num)) {
    u.send("Usage: +job/delete <#>");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  await jobs.delete({ id: job.id });
  await jobHooks.emit("job:deleted", job);
  u.send(`>JOBS: Job #${num} deleted.`);
}

export async function handleStaffMeta(
  u: IUrsamuSDK,
  sw: string,
  arg: string,
): Promise<boolean> {
  if (sw === "due") { await doDue(u, arg); return true; }
  if (sw === "status" || sw === "progress") {
    await doStatus(u, arg); return true;
  }
  if (sw === "esc" || sw === "pri") {
    await doEsc(u, arg); return true;
  }
  if (sw === "hold") { await doHold(u, arg); return true; }
  if (sw === "tag") { await doTag(u, arg); return true; }
  if (sw === "access") { await doAccess(u, arg); return true; }
  if (sw === "delete") { await doDelete(u, arg); return true; }
  return false;
}
