/**
 * Auto-approve when a CGEN job is closed from jobs UI / +job/close.
 */

import { jobHooks, type IJob } from "@ursamu/jobs";
import { approvePlayer } from "./approve_core.ts";

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

    const staffName = String(
      job.closedByName ||
        job.assigneeName ||
        "Staff",
    );
    const staffId = String(job.assignedTo || "0").replace(
      /^#/,
      "",
    );

    // Skip if approvePlayer already ran (+approve / HTTP) and
    // completeCgenJob emitted job:closed afterward.
    const result = await approvePlayer({
      playerId,
      staffId,
      staffName,
      notes: "",
      // Job is already closed — do not re-complete.
      completeJob: false,
    });

    if (!result.ok) {
      // No draft left is fine (approved via +approve already).
      if (!/no chargen draft/i.test(result.error)) {
        console.error(
          "[cofd] CGEN job:closed approve:",
          result.error,
        );
      }
      return;
    }
    if (!result.already) {
      console.log(
        `[cofd] CGEN #${job.number}: approved ${result.name}`,
      );
    }
  } catch (e: unknown) {
    console.error("[cofd] onJobClosed:", e);
  }
}

export function initApproveHooks(): void {
  // jobs UI "closed" and APR/resolve both finish a CGEN review
  jobHooks.on("job:closed", onJobClosed);
  jobHooks.on("job:resolved", onJobClosed);
}

export function removeApproveHooks(): void {
  jobHooks.off("job:closed", onJobClosed);
  jobHooks.off("job:resolved", onJobClosed);
}
