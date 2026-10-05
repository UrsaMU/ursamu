// Comment on an open CGEN job — same as +job/comment (deny path).

import {
  jobs,
  jobHooks,
  type IJob,
  type IJobComment,
} from "@ursamu/jobs";
import {
  findCgenJob,
  allJobs,
  numEq,
} from "./approve_job_find.ts";
import type { JobTouchResult } from "./approve_job_types.ts";

function makeComment(
  staffId: string,
  staffName: string,
  text: string,
): IJobComment {
  return {
    id: `jc-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    authorId: staffId,
    authorName: staffName,
    text,
    timestamp: Date.now(),
    published: true,
    staffOnly: false,
  };
}

export async function commentCgenJob(
  jobNum: number | string | undefined,
  playerId: string,
  staffId: string,
  staffName: string,
  reason: string,
): Promise<JobTouchResult> {
  const job = await findCgenJob(jobNum, playerId);
  if (!job) {
    return {
      number: null,
      completed: false,
      commented: false,
      error: "No matching open CGEN job found.",
    };
  }

  if (job.status !== "new" && job.status !== "open") {
    return {
      number: Number(job.number),
      completed: false,
      commented: false,
      error: `Job #${job.number} is already ${job.status}.`,
    };
  }

  const text = `Denied by ${staffName}: ${reason}`;
  const comment = makeComment(staffId, staffName, text);
  const nextStatus = job.status === "new" ? "open" : job.status;
  const updated: IJob = {
    ...job,
    status: nextStatus,
    assignedTo: staffId,
    assigneeName: staffName,
    updatedAt: Date.now(),
    comments: [...(job.comments ?? []), comment],
  };

  try {
    await jobs.update({ id: updated.id }, updated);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cofd] commentCgenJob failed:", err);
    return {
      number: Number(job.number),
      completed: false,
      commented: false,
      error: `Job #${job.number} comment failed: ${msg}`,
    };
  }

  try {
    await jobHooks.emit("job:commented", updated, comment);
  } catch (e: unknown) {
    console.error("[cofd] job:commented hook error:", e);
  }

  const check = (await allJobs()).find(
    (j) => j.id === updated.id || numEq(j.number, job.number),
  );
  if (!check) {
    return {
      number: Number(job.number),
      completed: false,
      commented: false,
      error: `Job #${job.number} vanished after comment.`,
    };
  }
  const hasComment = (check.comments ?? []).some(
    (c) => c.text === text,
  );
  if (!hasComment || check.status === "new") {
    return {
      number: Number(job.number),
      completed: false,
      commented: hasComment,
      error: hasComment
        ? `Job #${job.number} comment ok but still 'new'.`
        : `Job #${job.number} comment did not persist.`,
    };
  }

  return {
    number: Number(job.number),
    completed: false,
    commented: true,
  };
}
