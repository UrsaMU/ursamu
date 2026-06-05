import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { WIKI_DIR } from "./fs.ts";

// History snapshots are stored at: wiki/.history/<path>/<ISO-timestamp>.md
// Timestamps are ISO 8601 (colons replaced with hyphens for filesystem safety).

const HISTORY_DIR = ".history";

/** Build the absolute path for a history directory for a given wiki path. */
function historyDir(wikiPath: string): string {
  return resolve(join(WIKI_DIR, HISTORY_DIR, wikiPath));
}

/** Build a timestamp string safe for use as a filename. */
function makeTimestamp(): string {
  return new Date().toISOString().replace(/:/g, "-");
}

/**
 * Save a snapshot of the current page content before overwriting.
 * Snapshots are append-only — this function never deletes them.
 */
export async function saveSnapshot(wikiPath: string, content: string): Promise<void> {
  const dir  = historyDir(wikiPath);
  const file = join(dir, `${makeTimestamp()}.md`);
  await ensureDir(dir);
  await Deno.writeTextFile(file, content);
}

/**
 * List available history snapshots for a page, most-recent first.
 * Returns an array of timestamp strings (without the .md extension).
 */
export async function listHistory(wikiPath: string): Promise<string[]> {
  const dir = historyDir(wikiPath);
  const timestamps: string[] = [];
  try {
    for await (const e of Deno.readDir(dir)) {
      if (e.isFile && e.name.endsWith(".md")) {
        timestamps.push(e.name.replace(/\.md$/, ""));
      }
    }
  } catch { return []; }

  // Sort lexicographically descending — ISO timestamps sort correctly this way
  return timestamps.sort((a, b) => b.localeCompare(a));
}

/**
 * Read a specific snapshot for a page.
 * `timestamp` is the filename without extension, as returned by listHistory().
 * Returns null if not found.
 */
export async function readSnapshot(
  wikiPath: string,
  timestamp: string
): Promise<string | null> {
  // Sanitise timestamp: only allow ISO-like characters
  if (!/^[\d\-T.Z]+$/.test(timestamp)) return null;
  const file = join(historyDir(wikiPath), `${timestamp}.md`);
  const safe = resolve(file);
  // Path traversal guard
  if (!safe.startsWith(resolve(join(WIKI_DIR, HISTORY_DIR)))) return null;
  try { return await Deno.readTextFile(safe); } catch { return null; }
}

/**
 * Migrate all history snapshots when a page is moved to a new path.
 * Old history directory is removed after migration.
 */
export async function migrateHistory(
  oldPath: string,
  newPath: string
): Promise<void> {
  const oldDir = historyDir(oldPath);
  const newDir = historyDir(newPath);
  try {
    await ensureDir(newDir);
    for await (const e of Deno.readDir(oldDir)) {
      if (e.isFile && e.name.endsWith(".md")) {
        const src = join(oldDir, e.name);
        const dst = join(newDir, e.name);
        await Deno.rename(src, dst);
      }
    }
    await Deno.remove(oldDir, { recursive: true });
  } catch { /* source dir may not exist — no-op */ }
}
