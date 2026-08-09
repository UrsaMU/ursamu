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
      job.closedByName || job.assigneeName || "Staff",
    );
    const staffId = String(job.assignedTo || "0").replace(
      /^#/,
      "",
    );

    const result = await approvePlayer({
      playerId,
      staffId,
      staffName,
      notes: "",
      completeJob: false,
    });

    if (!result.ok) {
      // Already approved via +approve (draft cleared / mock DB).
      if (
        /no chargen draft|player not found|not submitted/i
          .test(result.error)
      ) {
        return;
      }
      console.error(
        "[dnd] CGEN job:closed approve:",
        result.error,
      );
      return;
    }
    if (!result.already) {
      console.log(
        `[dnd] CGEN #${job.number}: approved ${result.name}`,
      );
    }
  } catch (e: unknown) {
    console.error("[dnd] onJobClosed:", e);
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
