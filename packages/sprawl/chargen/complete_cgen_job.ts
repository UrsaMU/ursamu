/** Close + archive CGEN job after staff approve/reject. */
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
  jobNumber?: number | null;
  playerId: string;
  staffId: string;
  staffName: string;
  notes?: string;
  /** default closed = approved path */
  outcome?: "approved" | "rejected";
}): Promise<{ number: number | null; completed: boolean }> {
  const pid = bare(opts.playerId);
  const want = opts.jobNumber != null
    ? Number(opts.jobNumber)
    : null;
  const outcome = opts.outcome ?? "approved";

  let all: IJob[] = [];
  try {
    all = await jobs.find({});
  } catch (e: unknown) {
    console.error("[sprawl] completeCgenJob find:", e);
    return { number: want, completed: false };
  }

  const open = all.filter((j) => {
    if (String(j.bucket ?? "").toUpperCase() !== "CGEN") {
      return false;
    }
    if (j.status !== "new" && j.status !== "open") return false;
    return bare(String(j.submittedBy ?? "")) === pid;
  });

  let job = want != null && !Number.isNaN(want)
    ? open.find((j) => Number(j.number) === want) ?? null
    : null;
  if (!job) {
    job = open.sort((a, b) =>
      Number(b.number) - Number(a.number)
    )[0] ?? null;
  }
  if (!job) return { number: want, completed: false };

  const staffName = opts.staffName || "Staff";
  const verb = outcome === "approved" ? "Approved" : "Rejected";
  const text = opts.notes?.trim()
    ? `${verb} by ${staffName}: ${opts.notes.trim()}`
    : `${verb} by ${staffName}.`;
  const comment: IJobComment = {
    id: `jc-${Date.now()}-${Math.floor(Math.random() * 1e4)}`,
    authorId: bare(opts.staffId),
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
    assignedTo: bare(opts.staffId),
    assigneeName: staffName,
    updatedAt: Date.now(),
  };

  try {
    await jobs.update({ id: closed.id }, closed);
  } catch (e: unknown) {
    console.error("[sprawl] completeCgenJob update:", e);
    return { number: Number(job.number), completed: false };
  }

  try {
    await jobHooks.emit("job:commented", closed, comment);
  } catch (e: unknown) {
    console.error("[sprawl] job:commented:", e);
  }

  try {
    await jobArchive.create({ ...closed });
    await jobs.delete({ id: closed.id });
  } catch (e: unknown) {
    console.error("[sprawl] completeCgenJob archive:", e);
  }

  // Only emit closed for approve path (hook auto-approves).
  if (outcome === "approved") {
    try {
      await jobHooks.emit("job:closed", closed);
    } catch (e: unknown) {
      console.error("[sprawl] job:closed:", e);
    }
  }

  return { number: Number(job.number), completed: true };
}
