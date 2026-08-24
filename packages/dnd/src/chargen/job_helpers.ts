/**
 * CGEN job find / complete / comment helpers.
 */
import {
  jobs,
  jobArchive,
  jobHooks,
  type IJob,
  type IJobComment,
} from "@ursamu/jobs";

export type JobTouchResult = {
  number: number | null;
  completed: boolean;
  commented: boolean;
  error?: string;
};

export function normId(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

export function samePlayer(a: string, b: string): boolean {
  return normId(a) !== "" && normId(a) === normId(b);
}

export async function allJobs(): Promise<IJob[]> {
  try {
    return await jobs.find({});
  } catch (e: unknown) {
    console.error("[dnd] jobs.find failed:", e);
    return [];
  }
}

export async function findCgenJob(
  jobNum: number | string | undefined,
  playerId: string,
): Promise<IJob | null> {
  const all = await allJobs();
  if (!all.length) return null;

  if (jobNum != null && String(jobNum).trim() !== "") {
    const n = Number(jobNum);
    const byNum = all.find((j) => Number(j.number) === n);
    if (byNum) return byNum;
  }

  const open = all
    .filter((j) =>
      samePlayer(String(j.submittedBy ?? ""), playerId) &&
      String(j.bucket ?? "").toUpperCase() === "CGEN" &&
      (j.status === "new" || j.status === "open")
    )
    .sort((a, b) => Number(b.number) - Number(a.number));
  return open[0] ?? null;
}

export async function listOpenCgen(): Promise<IJob[]> {
  const all = await allJobs();
  return all
    .filter((j) =>
      String(j.bucket ?? "").toUpperCase() === "CGEN" &&
      (j.status === "new" || j.status === "open")
    )
    .sort((a, b) => Number(a.number) - Number(b.number));
}

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
    await jobs.update({ id: closed.id }, closed);
    await jobHooks.emit("job:commented", closed, comment);
    await jobArchive.create({ ...closed });
    await jobs.delete({ id: closed.id });
    await jobHooks.emit("job:closed", closed);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[dnd] completeCgenJob:", e);
    return {
      number: Number(job.number),
      completed: false,
      commented: true,
      error: `Job #${job.number}: ${msg}`,
    };
  }

  return {
    number: Number(job.number),
    completed: true,
    commented: true,
  };
}

export async function commentCgenJob(
  jobNum: number | string | undefined,
  playerId: string,
  staffId: string,
  staffName: string,
  notes: string,
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

  const comment = makeComment(
    staffId,
    staffName,
    `Denied by ${staffName}: ${notes}`,
  );
  const updated: IJob = {
    ...job,
    comments: [...(job.comments ?? []), comment],
    status: "open",
    updatedAt: Date.now(),
  };

  try {
    await jobs.update({ id: updated.id }, updated);
    await jobHooks.emit("job:commented", updated, comment);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return {
      number: Number(job.number),
      completed: false,
      commented: false,
      error: msg,
    };
  }

  return {
    number: Number(job.number),
    completed: false,
    commented: true,
  };
}

export function parseTargetAndNotes(
  arg: string,
): { who: string; notes: string } {
  const eq = arg.indexOf("=");
  if (eq < 0) return { who: arg.trim(), notes: "" };
  return {
    who: arg.slice(0, eq).trim(),
    notes: arg.slice(eq + 1).trim(),
  };
}
