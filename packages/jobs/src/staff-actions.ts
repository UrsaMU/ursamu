/**
 * Anomaly lifecycle switches for +job (approve/deny/due/status/…).
 * Called from staff-cmd after built-in switches fail to match.
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import { jobs, jobArchive, isValidBucket, getAllBuckets, getNextJobNumber } from "./db.ts";
import { jobHooks } from "./hooks.ts";
import type { IJob, IJobComment } from "./types.ts";
import { formatDate } from "./format.ts";
import { getJobByNumber } from "./job-utils.ts";
import { sendJobMail } from "./mail.ts";
import { wantsNospam } from "./prefs.ts";
import { handleStaffMeta } from "./staff-meta.ts";

function callerName(u: IUrsamuSDK): string {
  return (u.me.state?.moniker as string) ||
    (u.me.state?.name as string) ||
    u.me.name ||
    "Unknown";
}

function addComment(
  job: IJob,
  u: IUrsamuSDK,
  text: string,
  staffOnly = false,
): IJobComment {
  const c: IJobComment = {
    authorId: u.me.id,
    authorName: callerName(u),
    text,
    timestamp: Date.now(),
    published: !staffOnly,
    staffOnly,
  };
  job.comments.push(c);
  job.updatedAt = Date.now();
  return c;
}

async function mailUnlessNospam(
  u: IUrsamuSDK,
  job: IJob,
  subject: string,
  body: string,
): Promise<void> {
  if (job.submittedBy === u.me.id) return;
  // Check submitter prefs would need load; staff nospam is local
  if (wantsNospam(u, job.number)) return;
  await sendJobMail(u.me.id, job.submittedBy, subject, body);
}

/** @returns true if switch handled */
export async function handleStaffAction(
  u: IUrsamuSDK,
  sw: string,
  arg: string,
): Promise<boolean> {
  if (sw === "add" || sw === "act") {
    await doAdd(u, arg);
    return true;
  }
  if (sw === "create") {
    await doCreate(u, arg);
    return true;
  }
  if (sw === "complete") {
    await doClose(u, arg, "complete");
    return true;
  }
  if (sw === "approve") {
    await doClose(u, arg, "approve");
    return true;
  }
  if (sw === "deny") {
    await doClose(u, arg, "deny");
    return true;
  }
  if (await handleStaffMeta(u, sw, arg)) return true;
  return false;
}


async function doAdd(u: IUrsamuSDK, arg: string): Promise<void> {
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/add <#>=<comments>");
    return;
  }
  const num = parseInt(arg.slice(0, eq).trim(), 10);
  const text = arg.slice(eq + 1).trim();
  if (isNaN(num) || !text) {
    u.send("Usage: +job/add <#>=<comments>");
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const c = addComment(job, u, text, false);
  await jobs.update({ id: job.id }, job);
  await jobHooks.emit("job:commented", job, c);
  u.send(`>JOBS: Comment added to job #${num}.`);
  await mailUnlessNospam(
    u,
    job,
    `Job #${num}: ${job.title}`,
    `${callerName(u)} commented:\n\n${text}`,
  );
}

async function doCreate(u: IUrsamuSDK, arg: string): Promise<void> {
  // bucket/title=comment
  const eq = arg.indexOf("=");
  if (eq === -1) {
    u.send("Usage: +job/create <bucket>/<title>=<comment>");
    return;
  }
  const left = arg.slice(0, eq).trim();
  const text = arg.slice(eq + 1).trim();
  const slash = left.indexOf("/");
  if (slash === -1 || !text) {
    u.send("Usage: +job/create <bucket>/<title>=<comment>");
    return;
  }
  const bucket = left.slice(0, slash).trim().toUpperCase();
  const title = left.slice(slash + 1).trim();
  if (!isValidBucket(bucket)) {
    u.send(
      `>JOBS: Invalid bucket. Valid: ${getAllBuckets().join(", ")}`,
    );
    return;
  }
  const num = await getNextJobNumber();
  const now = Date.now();
  const job: IJob = {
    id: `job-${num}`,
    number: num,
    title,
    bucket,
    status: "open",
    progress: "new",
    submittedBy: u.me.id,
    submitterName: callerName(u),
    description: text,
    comments: [],
    additionalPlayers: [],
    tags: [],
    published: true,
    createdAt: now,
    updatedAt: now,
  };
  await jobs.create(job);
  await jobHooks.emit("job:created", job);
  u.send(`>JOBS: Job #${num} created in ${bucket}.`);
}

async function doClose(
  u: IUrsamuSDK,
  arg: string,
  mode: "complete" | "approve" | "deny",
): Promise<void> {
  const eq = arg.indexOf("=");
  const numStr = eq !== -1 ? arg.slice(0, eq).trim() : arg;
  const reason = eq !== -1 ? arg.slice(eq + 1).trim() : "";
  const num = parseInt(numStr, 10);
  if (isNaN(num)) {
    u.send(`Usage: +job/${mode} <#>[=<comments>]`);
    return;
  }
  const job = await getJobByNumber(num);
  if (!job) {
    u.send(`>JOBS: No job #${num} found.`);
    return;
  }
  const who = callerName(u);
  if (reason) addComment(job, u, reason, false);
  job.status = mode === "deny" ? "cancelled" : "closed";
  job.closedByName = who;
  job.updatedAt = Date.now();
  await jobArchive.create({ ...job });
  await jobs.delete({ id: job.id });
  await jobHooks.emit(
    mode === "deny" ? "job:closed" : "job:resolved",
    job,
  );
  u.send(`>JOBS: Job #${num} ${mode}d and archived.`);
  const label =
    mode === "approve"
      ? "approved"
      : mode === "deny"
      ? "denied"
      : "completed";
  let body =
    `${who} has ${label} your request #${num}.\n\n` +
    job.description;
  if (reason) {
    body += `\n\n${who} [${formatDate(Date.now())}]: ${reason}`;
  }
  await mailUnlessNospam(
    u,
    job,
    `Request #${num} ${label}: ${job.title}`,
    body,
  );
}

