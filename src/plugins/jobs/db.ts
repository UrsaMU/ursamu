import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";
import type { IJob } from "../../@types/IJob.ts";

export const jobs: DBO<IJob> = new DBO<IJob>("server.jobs");

export async function getNextJobNumber(): Promise<number> {
  const result = await counters.queryOne({ id: "jobid" });
  if (!result) {
    await counters.create({ id: "jobid", seq: 1 });
    return 1;
  }
  const next = result.seq + 1;
  await counters.modify({ id: "jobid" }, "$set", { seq: next });
  return next;
}
