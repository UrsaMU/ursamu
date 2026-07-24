// Locate CGEN jobs with tolerant id/number matching.

import { jobs, type IJob } from "@ursamu/jobs";

/** Strip leading # so "42" and "#42" compare equal. */
export function normId(id: string): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

export function samePlayer(a: string, b: string): boolean {
  return normId(a) !== "" && normId(a) === normId(b);
}

export function numEq(
  a: number | string | undefined,
  b: number | string | undefined,
): boolean {
  if (a == null || b == null) return false;
  const na = Number(a);
  const nb = Number(b);
  return !Number.isNaN(na) && na === nb;
}

export async function allJobs(): Promise<IJob[]> {
  try {
    return await jobs.find({});
  } catch (err: unknown) {
    console.error("[cofd] jobs.find failed:", err);
    return [];
  }
}

/**
 * Resolve a CGEN job by number, else latest open CGEN for player.
 * Coerces number types and normalizes player ids (#42 vs 42).
 */
export async function findCgenJob(
  jobNum: number | string | undefined,
  playerId: string,
): Promise<IJob | null> {
  const all = await allJobs();
  if (all.length === 0) return null;

  if (jobNum != null && String(jobNum).trim() !== "") {
    const byNum = all.find((j) => numEq(j.number, jobNum));
    if (byNum) return byNum;
  }

  const open = all
    .filter(
      (j) =>
        samePlayer(j.submittedBy, playerId) &&
        String(j.bucket ?? "").toUpperCase() === "CGEN" &&
        (j.status === "new" || j.status === "open"),
    )
    .sort((a, b) => Number(b.number) - Number(a.number));
  return open[0] ?? null;
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
