// ─── Books Folder Watcher ─────────────────────────────────────────────────────
//
// Watches the configured booksDir for new or modified files.
// Debounces events (500ms) and triggers the ingestion pipeline.
// Only one ingestion runs at a time — concurrent triggers are queued.

import type { IPipelineContext } from "./pipeline.ts";
import { runIngestionPipeline } from "./pipeline.ts";

const DEBOUNCE_MS = 500;
const SUPPORTED_EXTS = new Set([".txt", ".md", ".pdf"]);

export function startWatcher(
  getCtx: () => Promise<IPipelineContext>,
): () => void {
  let watcher: Deno.FsWatcher | null = null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let running = false;

  async function trigger() {
    if (running) return; // One ingestion at a time
    running = true;
    try {
      const ctx = await getCtx();
      await runIngestionPipeline(ctx);
    } catch (err) {
      console.error("[GM watcher] Pipeline error:", err);
    } finally {
      running = false;
    }
  }

  async function watch(booksDir: string) {
    try {
      await Deno.mkdir(booksDir, { recursive: true });
      watcher = Deno.watchFs(booksDir);

      for await (const event of watcher) {
        if (!["create", "modify", "rename"].includes(event.kind)) continue;
        const relevant = event.paths.some((p) =>
          SUPPORTED_EXTS.has(extname(p).toLowerCase())
        );
        if (!relevant) continue;

        // Debounce — batch rapid filesystem events
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(trigger, DEBOUNCE_MS);
      }
    } catch (err) {
      if (!(err instanceof Deno.errors.Interrupted)) {
        console.error("[GM watcher] Watch error:", err);
      }
    }
  }

  // Kick off the watcher (fire and forget — it runs as a background task)
  getCtx()
    .then((ctx) => watch(ctx.booksDir))
    .catch((err) => console.error("[GM watcher] Init error:", err));

  // Return a stop function
  return () => {
    if (debounceTimer) clearTimeout(debounceTimer);
    watcher?.close();
    watcher = null;
  };
}

function extname(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot >= 0 ? filename.slice(dot) : "";
}
