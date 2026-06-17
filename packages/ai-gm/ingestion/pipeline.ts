// ─── Ingestion Pipeline Orchestrator ─────────────────────────────────────────
//
// Wires together extractor → analyzer → synthesizer → reviewer.
// Called by the watcher (on file change) or +gm/ingest (manually).

import type { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { extractBooks } from "./extractor.ts";
import { analyzeChunks } from "./analyzer.ts";
import { synthesize } from "./synthesizer.ts";
import { buildOpeningMessage } from "./reviewer.ts";
import { gmIngestionJobs } from "./db.ts";
import type { IIngestionJob } from "./schema.ts";
import { nanoid } from "./util.ts";

export interface IPipelineContext {
  model: ChatGoogleGenerativeAI;
  booksDir: string;
  adminIds: string[];
  /** Called to page admins + post to AI-GM board */
  notify: (msg: string) => Promise<void>;
}

export async function runIngestionPipeline(
  ctx: IPipelineContext,
): Promise<IIngestionJob> {
  const now = new Date().toISOString();
  const job: IIngestionJob = {
    id: nanoid(),
    files: [],
    phase: "queued",
    uncertainItems: [],
    exchanges: [],
    adminIds: ctx.adminIds,
    startedAt: now,
    updatedAt: now,
  };

  await gmIngestionJobs.create(job);

  try {
    // ── Phase 1: Extract ────────────────────────────────────────────────────

    job.phase = "extracting";
    await updateJob(job);
    await ctx.notify(`[AI-GM] Starting ingestion from ${ctx.booksDir}...`);

    const { files, chunks } = await extractBooks(ctx.booksDir);
    job.files = files;

    if (chunks.length === 0) {
      throw new Error(`No readable content found in ${ctx.booksDir}`);
    }

    await ctx.notify(
      `[AI-GM] Extracted ${chunks.length} sections from ${files.length} file(s). Analyzing...`,
    );

    // ── Phase 2: Analyze ────────────────────────────────────────────────────

    job.phase = "analyzing";
    await updateJob(job);

    const extractions = await analyzeChunks(
      ctx.model,
      chunks,
      (done, total) => {
        ctx.notify(`[AI-GM] Analyzing batch ${done}/${total}...`).catch(
          () => {},
        );
      },
    );

    job.extractions = extractions;
    await updateJob(job);

    await ctx.notify(
      `[AI-GM] Analysis complete. ${extractions.length} extractions. Synthesizing...`,
    );

    // ── Phase 3: Synthesize ─────────────────────────────────────────────────

    const { draft, uncertainItems } = await synthesize(ctx.model, extractions);
    job.draft = draft;
    job.uncertainItems = uncertainItems;
    job.phase = "reviewing";
    await updateJob(job);

    // ── Phase 4: Notify admins for review ───────────────────────────────────

    const openingMessage = buildOpeningMessage(job);
    await ctx.notify(openingMessage);

    job.exchanges.push({
      role: "gm",
      message: openingMessage,
      timestamp: new Date().toISOString(),
    });
    await updateJob(job);
  } catch (err) {
    job.phase = "failed";
    job.error = err instanceof Error ? err.message : String(err);
    await updateJob(job);
    await ctx.notify(`[AI-GM] Ingestion failed: ${job.error}`);
  }

  return job;
}

async function updateJob(job: IIngestionJob): Promise<void> {
  job.updatedAt = new Date().toISOString();
  await gmIngestionJobs.update({ id: job.id }, job);
}
