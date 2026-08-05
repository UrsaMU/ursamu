/**
 * +jobs/compress and +jobs/clean (wizard).
 */
import type { IUrsamuSDK } from "@ursamu/mush";
import { dbojs } from "@ursamu/mush";
import { jobs } from "./db.ts";

export async function compressJobs(u: IUrsamuSDK): Promise<void> {
  if (!u.me.flags.has("superuser") && !u.me.flags.has("wizard")) {
    u.send(">JOBS: Wizard only.");
    return;
  }
  const all = (await jobs.find({})).sort((a, b) =>
    a.number - b.number
  );
  for (const j of all) await jobs.delete({ id: j.id });
  let n = 1;
  for (const j of all) {
    j.number = n;
    j.id = `job-${n}`;
    n++;
    await jobs.create(j);
  }
  u.send(
    `>JOBS: Compressed ${all.length} open job(s) to 1…` +
      `${all.length}. Archive unchanged.`,
  );
}

export async function cleanJobs(u: IUrsamuSDK): Promise<void> {
  if (!u.me.flags.has("superuser") && !u.me.flags.has("wizard")) {
    u.send(">JOBS: Wizard only.");
    return;
  }
  const all = await jobs.find({});
  let fixed = 0;
  for (const j of all) {
    let dirty = false;
    if (j.assignedTo) {
      const p = await dbojs.queryOne({ id: j.assignedTo });
      if (!p) {
        j.assignedTo = undefined;
        j.assigneeName = undefined;
        dirty = true;
      }
    }
    if (j.additionalPlayers?.length) {
      const keep: string[] = [];
      for (const id of j.additionalPlayers) {
        const p = await dbojs.queryOne({ id });
        if (p) keep.push(id);
        else dirty = true;
      }
      j.additionalPlayers = keep;
    }
    if (j.tags?.length) {
      const keep: string[] = [];
      for (const t of j.tags) {
        if (t.startsWith("#") || /^\d+$/.test(t)) {
          const p = await dbojs.queryOne({ id: t });
          if (p) keep.push(t);
          else dirty = true;
        } else {
          keep.push(t);
        }
      }
      j.tags = keep;
    }
    if (dirty) {
      j.updatedAt = Date.now();
      await jobs.update({ id: j.id }, j);
      fixed++;
    }
  }
  u.send(`>JOBS: Cleaned ${fixed} job(s) of stale refs.`);
}
