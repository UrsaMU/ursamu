import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";
import type { IJob } from "../../@types/IJob.ts";

export const jobs: DBO<IJob> = new DBO<IJob>("server.jobs");

export function getNextJobNumber(): Promise<number> {
  return counters.atomicIncrement("jobid");
}
