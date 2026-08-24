/**
 * Approve when a CGEN job is closed / resolved from jobs UI.
 * Submit leaves play locked (pending); this unlocks the sheet.
 */
import { jobHooks, type IJob } from "@ursamu/jobs";
import { dbojs, rewriteStatePaths } from "@ursamu/ursamu";
import type { ICPRCharacter } from "../../db/schemas.ts";
import { approveDraft } from "../../engine/chargen-ops.ts";
import { emitChargenComplete } from "../../engine/emitters.ts";

// deno-lint-ignore no-explicit-any
function cprFromRaw(player: any): ICPRCharacter | undefined {
  return (player?.data?.cpr ?? player?.state?.cpr) as
    | ICPRCharacter
    | undefined;
}

async function onJobClosed(job: IJob): Promise<void> {
  try {
    if (String(job.bucket ?? "").toUpperCase() !== "CGEN") {
      return;
    }
    const playerId = String(job.submittedBy ?? "").replace(
      /^#/,
      "",
    );
    if (!playerId) return;

    const rows = await dbojs.query({ id: playerId });
    const player = rows[0];
    if (!player) return;
    const cpr = cprFromRaw(player);
    if (!cpr) return;
    if (cpr.chargenComplete || cpr.chargenStatus === "approved") {
      return;
    }

    const res = approveDraft(cpr);
    if (!res.ok) {
      console.warn(
        `[cpr] CGEN #${job.number}: approve blocked — ${res.error}`,
      );
      return;
    }

    await dbojs.modify(
      { id: playerId },
      "$set",
      rewriteStatePaths({ "state.cpr": res.draft }) as Record<
        string,
        unknown
      >,
    );
    await dbojs.modify({ id: playerId }, "$unset", {
      "state.cpr": "",
    });
    // deno-lint-ignore no-explicit-any
    const pname = (player as any)?.data?.name ?? playerId;
    try {
      await emitChargenComplete(
        playerId,
        String(pname),
        res.draft.role,
        res.draft.chargenMethod ?? "complete",
      );
    } catch (e: unknown) {
      console.error("[cpr] emitChargenComplete:", e);
    }
    console.log(
      `[cpr] CGEN #${job.number}: approved ${pname}`,
    );
  } catch (e: unknown) {
    console.error("[cpr] onJobClosed:", e);
  }
}

export function initApproveHooks(): void {
  jobHooks.on("job:closed", onJobClosed);
  jobHooks.on("job:resolved", onJobClosed);
}

export function removeApproveHooks(): void {
  jobHooks.off("job:closed", onJobClosed);
  jobHooks.off("job:resolved", onJobClosed);
}
