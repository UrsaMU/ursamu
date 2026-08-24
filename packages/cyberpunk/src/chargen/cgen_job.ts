/**
 * Open a staff CGEN job when a player submits for review.
 * Play stays locked until staff closes/resolves the job
 * (or +approve).
 */
import {
  getNextJobNumber,
  jobs,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
import type { ICPRCharacter } from "../../db/schemas.ts";

function snapshot(
  name: string,
  cpr: ICPRCharacter,
): string {
  const s = cpr.stats;
  const notes = String(cpr.conceptNotes ?? "").trim();
  const noteBlock = notes
    ? `--- CONCEPT ---\n${notes}`
    : "--- CONCEPT ---\n(none)";
  return [
    `STATUS: PENDING STAFF APPROVAL`,
    `Edgerunner: ${name}`,
    `Role: ${cpr.role} (rank ${cpr.roleRank})`,
    `Method: ${cpr.chargenMethod ?? "unknown"}`,
    `STATs INT${s.int} REF${s.ref} DEX${s.dex} TECH${s.tech} ` +
    `COOL${s.cool} WILL${s.will} LUCK${s.luck} MOVE${s.move} ` +
    `BODY${s.body} EMP${s.emp}/${s.empBase}`,
    `HP ${cpr.hp.current}/${cpr.hp.max}  EB ${cpr.eurodollars}`,
    `HL ${cpr.humanityLoss}  Chrome: ${
      (cpr.cyberware ?? []).length
    }`,
    noteBlock,
    `Close/resolve this job to APPROVE and unlock play.`,
    `Or: +approve ${name}  /  +reject ${name}=reason`,
  ].join("\n");
}

export async function openCgenJob(opts: {
  actorId: string;
  actorName: string;
  cpr: ICPRCharacter;
}): Promise<{ number: number } | { error: string }> {
  const { actorId, actorName, cpr } = opts;
  try {
    const all = await jobs.find({});
    const existing = all
      .filter((j) =>
        String(j.submittedBy ?? "").replace(/^#/, "") ===
          actorId.replace(/^#/, "") &&
        String(j.bucket ?? "").toUpperCase() === "CGEN" &&
        (j.status === "new" || j.status === "open")
      )
      .sort((a, b) => Number(b.number) - Number(a.number))[0];

    const now = Date.now();
    const desc = snapshot(actorName, cpr);

    if (existing) {
      existing.description = desc;
      existing.updatedAt = now;
      existing.status = "open";
      await jobs.update({ id: existing.id }, existing);
      return { number: Number(existing.number) };
    }

    const number = await getNextJobNumber();
    const job: IJob = {
      id: `job-${number}`,
      number,
      title: `CGEN pending: ${actorName} (${cpr.role})`,
      bucket: "CGEN",
      status: "new",
      submittedBy: actorId,
      submitterName: actorName,
      description: desc,
      comments: [],
      createdAt: now,
      updatedAt: now,
    };
    await jobs.create(job);
    try {
      await jobHooks.emit("job:created", job);
    } catch (e: unknown) {
      console.error("[cpr] job:created:", e);
    }
    return { number };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[cpr] openCgenJob:", e);
    return { error: msg };
  }
}
