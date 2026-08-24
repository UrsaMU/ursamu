/**
 * +cg/submit — open/refresh a CGEN job; do not promote sheet yet.
 */
import {
  getNextJobNumber,
  jobs,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
import type { DndCgState } from "./state.ts";
import { buildSheetFromCg, sheetSnapshot } from "./build_sheet.ts";
import { findCgenJob } from "./job_helpers.ts";

export type SubmitResult =
  | {
    ok: true;
    cg: DndCgState;
    jobNumber: number;
    resubmit: boolean;
  }
  | {
    ok: false;
    error: string;
    alreadyPending?: boolean;
    jobNumber?: number;
  };

export async function submitCgDraft(opts: {
  actorId: string;
  actorName: string;
  cg: DndCgState;
}): Promise<SubmitResult> {
  const { actorId, actorName, cg } = opts;
  const sheet = buildSheetFromCg(cg);
  const snapshot = sheetSnapshot(actorName, sheet);
  const now = Date.now();

  const existing = await findCgenJob(cg.submittedJob, actorId);

  if (
    existing &&
    (existing.status === "new" || existing.status === "open") &&
    cg.isSubmitted
  ) {
    return {
      ok: false,
      error:
        `Already pending staff review (CGEN #${existing.number}).`,
      alreadyPending: true,
      jobNumber: Number(existing.number),
    };
  }

  let number: number;
  let resubmit = false;

  if (
    existing &&
    (existing.status === "new" || existing.status === "open")
  ) {
    resubmit = true;
    number = Number(existing.number);
    const resubComment = {
      id: `jc-${now}-resub`,
      authorId: actorId,
      authorName: actorName,
      text: "Player resubmitted after revision.",
      timestamp: now,
      published: true,
      staffOnly: false,
    };
    existing.description = snapshot;
    existing.status = "open";
    existing.updatedAt = now;
    existing.comments = [
      ...(existing.comments ?? []),
      resubComment,
    ];
    await jobs.update({ id: existing.id }, existing);
    try {
      await jobHooks.emit(
        "job:commented",
        existing,
        resubComment,
      );
    } catch (e: unknown) {
      console.error("[dnd] job:commented (resub):", e);
    }
  } else {
    number = await getNextJobNumber();
    const job: IJob = {
      id: `job-${number}`,
      number,
      title: `Chargen: ${actorName} (${sheet.class})`,
      bucket: "CGEN",
      status: "new",
      submittedBy: actorId,
      submitterName: actorName,
      description: snapshot,
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    await jobs.create(job);
    try {
      await jobHooks.emit("job:created", job);
    } catch (e: unknown) {
      console.error("[dnd] job:created:", e);
    }
  }

  const next: DndCgState = {
    ...cg,
    pendingSheet: sheet,
    submittedJob: number,
    submittedAt: now,
    isSubmitted: true,
  };

  return { ok: true, cg: next, jobNumber: number, resubmit };
}
