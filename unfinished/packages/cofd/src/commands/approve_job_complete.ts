// Complete (archive+delete) a CGEN job — same as +job/close.

import {
  jobs,
  jobArchive,
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

export async function completeCgenJob(
  jobNum: number | string | undefined,
  playerId: string,
  staffId: string,
  staffName: string,
  notes: string,
): Promise<JobTouchResult> {
  const job = await findCgenJob(jobNum, playerId);
  if (!job) {
    return {
      number: jobNum != null && !Number.isNaN(Number(jobNum))
        ? Number(jobNum)
        : null,
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

  const text = notes
    ? `Approved by ${staffName}: ${notes}`
    : `Approved by ${staffName}.`;
  const comment = makeComment(staffId, staffName, text);
  const closed: IJob = {
    ...job,
    comments: [...(job.comments ?? []), comment],
    status: "closed",
    closedByName: staffName,
    assignedTo: staffId,
    assigneeName: staffName,
    updatedAt: Date.now(),
  };

  try {
    // Persist closed state while still in the active queue so any
    // hook that re-reads the job can see the approval comment.
    await jobs.update({ id: closed.id }, closed);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cofd] completeCgenJob update failed:", err);
    return {
      number: Number(job.number),
      completed: false,
      commented: false,
      error:
        `Job #${job.number} close error: ${msg}. ` +
        `Try: +job/close ${job.number}`,
    };
  }

  // Jobs BBS bridge (and Discord) listen on these hooks.
  // Comment first (approval text), then closed (board "Closed" reply).
  try {
    await jobHooks.emit("job:commented", closed, comment);
  } catch (e: unknown) {
    console.error("[cofd] job:commented (approve):", e);
  }

  try {
    await jobArchive.create({ ...closed });
    await jobs.delete({ id: closed.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("[cofd] completeCgenJob archive failed:", err);
    // Still emit closed so the board gets a completion post.
    try {
      await jobHooks.emit("job:closed", closed);
    } catch {
      /* ignore */
    }
    return {
      number: Number(job.number),
      completed: false,
      commented: true,
      error:
        `Job #${job.number} archive error: ${msg}. ` +
        `Try: +job/close ${job.number}`,
    };
  }

  const still = (await allJobs()).find(
    (j) => numEq(j.number, job.number) || j.id === job.id,
  );
  if (still && (still.status === "new" || still.status === "open")) {
    try {
      still.status = "closed";
      still.closedByName = staffName;
      still.comments = closed.comments;
      still.updatedAt = Date.now();
      await jobs.update({ id: still.id }, still);
      await jobs.delete({ id: still.id });
    } catch (err2: unknown) {
      console.error("[cofd] completeCgenJob retry:", err2);
    }
    const again = (await allJobs()).find(
      (j) => numEq(j.number, job.number) || j.id === job.id,
    );
    if (again && (again.status === "new" || again.status === "open")) {
      try {
        await jobHooks.emit("job:closed", closed);
      } catch {
        /* ignore */
      }
      return {
        number: Number(job.number),
        completed: false,
        commented: true,
        error:
          `Job #${job.number} is still ${again.status}. ` +
          `Close manually: +job/close ${job.number}`,
      };
    }
  }

  try {
    await jobHooks.emit("job:closed", closed);
  } catch (e: unknown) {
    console.error("[cofd] job:closed hook error:", e);
  }

  return {
    number: Number(job.number),
    completed: true,
    commented: true,
  };
}
