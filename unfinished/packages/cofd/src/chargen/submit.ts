/**
 * Finalize chargen: open/refresh a CGEN job and mark draft submitted.
 * Shared by +cg/submit and the HTTP Finish button.
 */

import {
  getNextJobNumber,
  jobs,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
import { formatSheet } from "../sheet/index.ts";
import type { CofdCgState } from "./state.ts";

export type SubmitResult =
  | {
    ok: true;
    cg: CofdCgState;
    jobNumber: number;
    resubmit: boolean;
  }
  | {
    ok: false;
    error: string;
    alreadyPending?: boolean;
    jobNumber?: number;
  };

function barePlayerId(id: string): string {
  return String(id).replace(/^#/, "");
}

function buildSnapshot(
  name: string,
  actorId: string,
  sheet: CofdCgState["sheet"],
  formatted: string,
): string {
  const template = String(sheet.template ?? "Mortal");
  const concept = String(sheet.concept ?? "(none)");
  return [
    `Character: ${name}`,
    `Template:  ${template}`,
    `Concept:   ${concept}`,
    ``,
    `Sheet snapshot:`,
    formatted,
    ``,
    `Raw JSON snapshot:`,
    "```json",
    JSON.stringify(sheet, null, 2),
    "```",
  ].join("\n");
}

async function findOpenCgen(
  actorId: string,
  submittedJob?: number,
): Promise<IJob | null> {
  const bareId = barePlayerId(actorId);
  let all: IJob[] = [];
  try {
    all = await jobs.find({});
  } catch {
    return null;
  }

  let existing: IJob | null = null;
  if (submittedJob != null) {
    const want = Number(submittedJob);
    existing = all.find((j) => Number(j.number) === want) ??
      null;
  }
  if (
    !existing ||
    (existing.status !== "new" && existing.status !== "open")
  ) {
    existing = all
      .filter((j) => {
        const by = barePlayerId(String(j.submittedBy ?? ""));
        return (
          by === bareId &&
          String(j.bucket ?? "").toUpperCase() === "CGEN" &&
          (j.status === "new" || j.status === "open")
        );
      })
      .sort((a, b) => Number(b.number) - Number(a.number))[0] ??
      null;
  }
  return existing;
}

/**
 * Create or refresh the CGEN job for a finished draft.
 * Caller must have already validated the final stage.
 */
export async function submitCgDraft(opts: {
  actorId: string;
  actorName: string;
  cg: CofdCgState;
}): Promise<SubmitResult> {
  const { actorId, actorName, cg } = opts;
  const sheet = cg.sheet;
  if (!sheet.specialties) sheet.specialties = {};

  const now = Date.now();
  const template = String(sheet.template ?? "Mortal");
  let formatted = "";
  try {
    formatted = await formatSheet(actorName, actorId, sheet);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    formatted = `(sheet render failed: ${msg})`;
  }
  const snapshot = buildSnapshot(
    actorName,
    actorId,
    sheet,
    formatted,
  );

  const existing = await findOpenCgen(actorId, cg.submittedJob);

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
      jobNumber: existing.number,
    };
  }

  let number: number;
  let resubmit = false;

  if (
    existing &&
    (existing.status === "new" || existing.status === "open")
  ) {
    resubmit = true;
    number = existing.number;
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
      ...existing.comments,
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
      console.error("[cofd] job:commented (resub):", e);
    }
  } else {
    number = await getNextJobNumber();
    const job: IJob = {
      id: `job-${number}`,
      number,
      title: `Chargen: ${actorName} (${template})`,
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
      console.error("[cofd] job:created emit failed:", e);
    }
  }

  const next: CofdCgState = {
    ...cg,
    sheet,
    submittedJob: number,
    submittedAt: now,
    isSubmitted: true,
  };

  return {
    ok: true,
    cg: next,
    jobNumber: number,
    resubmit,
  };
}
