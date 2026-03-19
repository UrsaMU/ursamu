import { DBO } from "../../services/Database/database.ts";
import { counters } from "../../services/Database/index.ts";
import type { IJob, IJobAccess } from "../../@types/IJob.ts";

/** Persistent store for all job records. */
export const jobs: DBO<IJob> = new DBO<IJob>("server.jobs");
export const jobArchive: DBO<IJob> = new DBO<IJob>("server.jobs_archive");
export const jobAccess: DBO<IJobAccess> = new DBO<IJobAccess>("server.jobs_access");

/** Atomically increment and return the next sequential job number (1, 2, 3, …). */
export function getNextJobNumber(): Promise<number> {
  return counters.atomicIncrement("jobid");
}
