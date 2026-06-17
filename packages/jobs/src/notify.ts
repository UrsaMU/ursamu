// ─── Staff notification for new jobs ─────────────────────────────────────────

import { jobHooks } from "./hooks.ts";
import { send, sessions, dbojs } from "@ursamu/mush";
import type { IJob } from "./types.ts";

const STAFF_FLAGS = ["superuser", "admin", "wizard"] as const;

/**
 * Handler registered on job:created — sends an in-game message to all
 * connected staff members (excluding the submitter) when a new job arrives.
 */
const onJobCreated = async (job: IJob): Promise<void> => {
  const notified = new Set<string>();
  for (const sess of sessions.list()) {
    const actorId = sess.meta.actorId as string | undefined;
    if (!actorId || actorId === job.submittedBy || notified.has(actorId)) continue;
    const playerObj = await dbojs.queryOne({ id: actorId });
    if (!playerObj) continue;
    // Split flag string into a Set — prevents substring bypass (e.g. "notsuperuser")
    const flagSet = new Set((playerObj.flags || "").split(" ").filter(Boolean));
    if (STAFF_FLAGS.some((f) => flagSet.has(f))) {
      send(
        [sess.socketId],
        `%ch>JOBS:%cn New ${job.bucket} job #${job.number}: "${job.title}" from ${job.submitterName}.`,
      );
      notified.add(actorId);
    }
  }
};

/** Wire up the job:created notification hook. */
export function registerNotifyHooks(): void {
  jobHooks.on("job:created", onJobCreated);
}

/** Remove the job:created notification hook (called on plugin remove). */
export function removeNotifyHooks(): void {
  jobHooks.off("job:created", onJobCreated);
}
