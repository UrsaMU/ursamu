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
    // Rejects also close jobs — only approve when comment says Approved
    // or no reject marker. Prefer staff +chargen/reject for denials;
    // closing from UI = approve (CPR/CofD convention).
    const playerId = String(job.submittedBy ?? "").replace(
      /^#/,
      "",
    );
    if (!playerId) return;

    const last = [...(job.comments ?? [])].reverse()[0];
    const text = String(last?.text ?? "").toLowerCase();
    if (text.startsWith("rejected")) return;

    const res = await approvePlayer({
      playerId,
      staffId: String(job.assignedTo ?? job.closedByName ?? "0"),
      staffName: String(
        job.closedByName ?? job.assigneeName ?? "Staff",
      ),
      completeJob: false, // already closed
    });
    if (!res.ok) {
      console.warn(
        `[sprawl] CGEN #${job.number}: ${res.error}`,
      );
      return;
    }
    if (!res.already) {
      console.log(
        `[sprawl] CGEN #${job.number}: approved ${res.name}`,
      );
    }
  } catch (e: unknown) {
    console.error("[sprawl] onJobClosed:", e);
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
