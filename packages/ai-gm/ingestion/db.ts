import { DBO } from "@ursamu/mush";
import type { IIngestionJob } from "./schema.ts";

export const gmIngestionJobs = new DBO<IIngestionJob>(
  "server.gm.ingestion_jobs",
);
