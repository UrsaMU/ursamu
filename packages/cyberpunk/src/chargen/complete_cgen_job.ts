/**
 * Close + archive a CGEN job after staff approve (HTTP / jobs UI).
 */
import {
  jobArchive,
  jobHooks,
  jobs,
  type IJob,
  type IJobComment,
} from "@ursamu/jobs";

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

export async function completeCgenJob(opts: {
  jobNumber?: number | string | null;
  playerId: string;
  staffId: string;
  staffName: string;
  notes?: string;
}): Promise<{ number: number | null; completed: boolean }> {
  const pid = bare(opts.playerId);
  const want = opts.jobNumber != null && opts.jobNumber !== ""
    ? Number(opts.jobNumber)
    : null;

  let all: IJob[] = [];
  try {
    all = await jobs.find({});
  } catch (e: unknown) {
    console.error("[cpr] completeCgenJob find:", e);
    return { number: want, completed: false };
  }

  const open = all.filter((j) => {
    if (String(j.bucket ?? "").toUpperCase() !== "CGEN") {
      return false;
    }
    if (j.status !== "new" && j.status !== "open") return false;
    if (bare(String(j.submittedBy ?? "")) !== pid) return false;
    return true;
  });

  let job = want != null && !Number.isNaN(want)
    ? open.find((j) => Number(j.number) === want) ?? null
    : null;
  if (!job) {
    job = open.sort((a, b) =>
      Number(b.number) - Number(a.number)
    )[0] ?? null;
  }
  if (!job) {
    return { number: want, completed: false };
  }

  const staffName = opts.staffName || "Staff";
  const text = opts.notes?.trim()
    ? `Approved by ${staffName}: ${opts.notes.trim()}`
    : `Approved by ${staffName}.`;
  const comment: IJobComment = {
    id: `jc-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    authorId: opts.staffId,
    authorName: staffName,
    text,
    timestamp: Date.now(),
    published: true,
    staffOnly: false,
  };
  const closed: IJob = {
    ...job,
    comments: [...(job.comments ?? []), comment],
    status: "closed",
    closedByName: staffName,
    assignedTo: opts.staffId,
    assigneeName: staffName,
    updatedAt: Date.now(),
  };

  try {
    await jobs.update({ id: closed.id }, closed);
  } catch (e: unknown) {
    console.error("[cpr] completeCgenJob update:", e);
    return { number: Number(job.number), completed: false };
  }

  try {
    await jobHooks.emit("job:commented", closed, comment);
  } catch (e: unknown) {
    console.error("[cpr] job:commented:", e);
  }

  try {
    await jobArchive.create({ ...closed });
    await jobs.delete({ id: closed.id });
  } catch (e: unknown) {
    console.error("[cpr] completeCgenJob archive:", e);
  }

  // Sheet already approved by HTTP path; hook no-ops if complete.
  try {
    await jobHooks.emit("job:closed", closed);
  } catch (e: unknown) {
    console.error("[cpr] job:closed:", e);
  }

  return { number: Number(job.number), completed: true };
}
