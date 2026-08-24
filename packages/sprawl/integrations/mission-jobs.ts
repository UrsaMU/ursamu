/**
 * MISSION job bucket → AP grant on close/resolve (AP-only advance).
 */
import { jobHooks, type IJob } from "@ursamu/jobs";
import { dbojs, gameHooks } from "@ursamu/ursamu";
import { getChar, saveChar } from "../engine/sheet-io.ts";
import {
  grantAp,
  missionCloseAp,
} from "../engine/advance-rules.ts";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

void saveChar;

function isMissionBucket(job: IJob): boolean {
  const b = String(job.bucket ?? "").toUpperCase();
  return b === "MISSION" || b === "RUN" || b === "GIG";
}

async function onMissionClosed(job: IJob): Promise<void> {
  try {
    if (!isMissionBucket(job)) return;
    const playerId = String(job.submittedBy ?? "").replace(
      /^#/,
      "",
    );
    if (!playerId) return;

    const last = [...(job.comments ?? [])].reverse()[0];
    const text = String(last?.text ?? "").toLowerCase();
    if (
      text.startsWith("reject") ||
      text.startsWith("fail") ||
      text.startsWith("cancel")
    ) {
      return;
    }

    const obj = await dbojs.queryOne({ id: playerId }) as
      | IDBObj
      | null
      | undefined;
    if (!obj) return;
    const c = getChar(obj);
    if (!c?.chargenComplete) return;

    const gained = missionCloseAp();
    const next = grantAp(c, gained);
    obj.state = { ...obj.state, sprawl: next };
    await dbojs.modify({ id: playerId }, "$set", {
      "state.sprawl": next,
    });

    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit?.("player:notify", {
      actorId: playerId,
      message:
        `[Sprawl] Mission complete — ` +
        `+${gained} AP (total ${next.apTotal ?? next.ap}). ` +
        `%ch+advance/<track>%cn spends ${100} AP.`,
    });
    console.log(
      `[sprawl] MISSION #${job.number}: +${gained} AP ` +
        `${obj.name}`,
    );
  } catch (e: unknown) {
    console.error("[sprawl] mission job:", e);
  }
}

export function initMissionJobHooks(): void {
  jobHooks.on("job:closed", onMissionClosed);
  jobHooks.on("job:resolved", onMissionClosed);
}

export function removeMissionJobHooks(): void {
  jobHooks.off("job:closed", onMissionClosed);
  jobHooks.off("job:resolved", onMissionClosed);
}

/** Test helper — same path without jobs plugin. */
export async function grantMissionFromJob(
  u: IUrsamuSDK,
  playerId: string,
): Promise<boolean> {
  const found = await u.db.search({ id: playerId });
  const obj = (found as IDBObj[])[0];
  if (!obj) return false;
  const c = getChar(obj);
  if (!c) return false;
  await saveChar(u, grantAp(c, missionCloseAp()), playerId);
  return true;
}
