/**
 * Open/refresh a staff CGEN job when a goon submits for review.
 * Jobs plugin mirrors lifecycle to the BBS Jobs board when present.
 */
import {
  getNextJobNumber,
  jobs,
  jobHooks,
  type IJob,
} from "@ursamu/jobs";
import type { ISprawlChar } from "../db/schemas.ts";

function bare(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function snapshot(name: string, c: ISprawlChar): string {
  const s = c.stats;
  return [
    `STATUS: PENDING STAFF APPROVAL`,
    `Goon: ${name}`,
    `Background: ${c.backgroundName || c.background || "—"}`,
    `Edge: ${c.edgeName || c.edge || "—"}`,
    `Stats MOR${s.morphology} EQU${s.equilibrium}` +
    ` REA${s.reaction} COG${s.cognition} AFF${s.affinity}`,
    `Res ${c.resilience}/${c.resilienceMax}` +
    `  Loadout max ${c.loadoutMax}  b¥ ${c.bityuan}`,
    `Affectations: ${(c.affectations ?? []).join(", ") || "—"}`,
    `Quirks: ${(c.quirks ?? []).join(", ") || "—"}`,
    `Augs: ${(c.augs ?? []).map((a) => a.name).join(", ") || "—"}`,
    ``,
    `Close/resolve this job to APPROVE and unlock play.`,
    `Or: +chargen/approve ${name}`,
    `Reject: +chargen/reject ${name}=reason`,
  ].join("\n");
}

export async function openCgenJob(opts: {
  actorId: string;
  actorName: string;
  char: ISprawlChar;
}): Promise<{ number: number } | { error: string }> {
  const { actorId, actorName, char } = opts;
  const pid = bare(actorId);
  try {
    const all = await jobs.find({});
    const existing = all
      .filter((j) =>
        bare(String(j.submittedBy ?? "")) === pid &&
        String(j.bucket ?? "").toUpperCase() === "CGEN" &&
        (j.status === "new" || j.status === "open")
      )
      .sort((a, b) => Number(b.number) - Number(a.number))[0];

    const now = Date.now();
    const desc = snapshot(actorName, char);
    const bg = char.backgroundName || char.background || "goon";

    if (existing) {
      existing.description = desc;
      existing.updatedAt = now;
      existing.status = "open";
      existing.title = `CGEN pending: ${actorName} (${bg})`;
      await jobs.update({ id: existing.id }, existing);
      return { number: Number(existing.number) };
    }

    const number = await getNextJobNumber();
    const job: IJob = {
      id: `job-${number}`,
      number,
      title: `CGEN pending: ${actorName} (${bg})`,
      bucket: "CGEN",
      status: "new",
      submittedBy: pid,
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
      console.error("[sprawl] job:created:", e);
    }
    return { number };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[sprawl] openCgenJob:", e);
    return { error: msg };
  }
}
