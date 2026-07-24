/**
 * Optional bridge: mirror @ursamu/jobs lifecycle events onto the
 * staff-only "Jobs" BBS board. Soft-loads jobHooks so BBS still
 * starts when jobs is not installed.
 */

import type { IBridgeComment, IBridgeJob } from "./job-format.ts";
import { createJobPost, replyToJob } from "./job-posts.ts";

// deno-lint-ignore no-explicit-any
type JobHandler = (...args: any[]) => void | Promise<void>;

interface IJobHooksApi {
  on(event: string, handler: JobHandler): void;
  off(event: string, handler: JobHandler): void;
}

// ─── event handlers (exported for tests) ─────────────────────────────────────

export async function onJobCreated(job: IBridgeJob): Promise<void> {
  await createJobPost(job);
}

export async function onJobAssigned(job: IBridgeJob): Promise<void> {
  const who = job.assigneeName ?? "Unassigned";
  await replyToJob(
    job,
    "Assigned",
    `Job #${job.number} assigned to ${who}.`,
  );
}

export async function onJobCommented(
  job: IBridgeJob,
  comment: IBridgeComment,
): Promise<void> {
  if (comment.staffOnly) return;
  await replyToJob(
    job,
    `Comment by ${comment.authorName}`,
    comment.text,
  );
}

export async function onJobStatusChanged(
  job: IBridgeJob,
  oldStatus: string,
): Promise<void> {
  await replyToJob(
    job,
    `Status: ${oldStatus} → ${job.status}`,
    `Job #${job.number} status changed from ${oldStatus} ` +
      `to ${job.status}.`,
  );
}

export async function onJobPriorityChanged(
  job: IBridgeJob,
  oldPriority: string,
): Promise<void> {
  const next = job.priority ?? "normal";
  await replyToJob(
    job,
    `Priority: ${oldPriority} → ${next}`,
    `Job #${job.number} priority changed from ${oldPriority} ` +
      `to ${next}.`,
  );
}

export async function onJobResolved(job: IBridgeJob): Promise<void> {
  await replyToJob(
    job,
    "Resolved",
    `Job #${job.number} marked resolved.`,
  );
}

export async function onJobReopened(job: IBridgeJob): Promise<void> {
  await replyToJob(
    job,
    "Reopened",
    `Job #${job.number} reopened.`,
  );
}

export async function onJobClosed(job: IBridgeJob): Promise<void> {
  const by = job.closedByName ? ` by ${job.closedByName}` : "";
  await replyToJob(
    job,
    "Closed",
    `Job #${job.number} closed${by}.`,
  );
}

export async function onJobDeleted(job: IBridgeJob): Promise<void> {
  await replyToJob(
    job,
    "Deleted",
    `Job #${job.number} permanently deleted.`,
  );
}

// ─── subscribe / unsubscribe ─────────────────────────────────────────────────

let _hooks: IJobHooksApi | null = null;
let _wired = false;

const BINDINGS: Array<[string, JobHandler]> = [
  ["job:created", onJobCreated],
  ["job:assigned", onJobAssigned],
  ["job:commented", onJobCommented],
  ["job:status-changed", onJobStatusChanged],
  ["job:priority-changed", onJobPriorityChanged],
  ["job:resolved", onJobResolved],
  ["job:reopened", onJobReopened],
  ["job:closed", onJobClosed],
  ["job:deleted", onJobDeleted],
];

function wire(hooks: IJobHooksApi): void {
  for (const [ev, h] of BINDINGS) hooks.on(ev, h);
  _hooks = hooks;
  _wired = true;
}

function unwire(hooks: IJobHooksApi): void {
  for (const [ev, h] of BINDINGS) hooks.off(ev, h);
}

/**
 * Soft-load @ursamu/jobs and subscribe. No-ops if jobs is absent.
 * Returns true when the bridge is active.
 */
export async function registerJobBridge(): Promise<boolean> {
  if (_wired) return true;
  try {
    const mod = await import("@ursamu/jobs");
    if (!mod.jobHooks) return false;
    wire(mod.jobHooks as IJobHooksApi);
    console.log(
      "[bbs] Job bridge active — events mirror to Jobs board.",
    );
    return true;
  } catch (_e: unknown) {
    console.log(
      "[bbs] Jobs plugin not found — job bridge skipped.",
    );
    return false;
  }
}

/** Unsubscribe all job handlers. Safe if never wired. */
export function removeJobBridge(): void {
  if (!_wired || !_hooks) return;
  unwire(_hooks);
  _hooks = null;
  _wired = false;
}

// Re-export pure helpers used by tests / consumers.
export {
  bucketLabel,
  formatCreatedBody,
  formatCreatedSubject,
  jobTag,
} from "./job-format.ts";
export type { IBridgeComment, IBridgeJob } from "./job-format.ts";
