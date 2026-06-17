/**
 * FileProvider — aggregates markdown help files from:
 *   1. ./help/              (game-level root, always scanned)
 *   2. Any directory registered via registerHelpDir()
 *
 * Section derivation:
 *   ./help/<section>/<topic>.md   → section = folder name
 *   ./help/<topic>.md             → section = "general"
 *   registerHelpDir(path, sect)   → section = explicit argument
 *
 * Files are cached at init() time. Call bustCache() to rescan
 * (triggered by the +help/reload command).
 *
 * Priority 50 — below DB (100) but above CommandProvider (10).
 *
 * Security:
 *   - scanDir resolves every file path with Deno.realPath() before reading and
 *     verifies it is contained within the originally registered root directory.
 *     This prevents symlink traversal attacks where a .md symlink inside the
 *     help directory points to a sensitive file outside it.
 *   - registerHelpDir logs a warning when the resolved path is outside cwd.
 *     Plugins installed via JSR may legitimately live outside cwd, but an
 *     accidental or malicious registration of "/" or "/etc" is surfaced clearly.
 */

import type { HelpEntry, HelpProvider } from "../registry.ts";
import { slugify } from "../registry.ts";

interface RegisteredDir {
  path: string;
  section: string;
}

const _registeredDirs: RegisteredDir[] = [];
let _cache: Map<string, HelpEntry> | null = null;

/**
 * Register a directory to be scanned for help files.
 * Call this in your plugin's init() to include your plugin's help/ folder.
 *
 * @param path    Absolute path to the directory (use `new URL("./help", import.meta.url).pathname`)
 * @param section Section name for all topics in this directory
 *
 * @example
 * // In your plugin's init():
 * registerHelpDir(new URL("./help", import.meta.url).pathname, "mail");
 */
export function registerHelpDir(path: string, section: string): void {
  _registeredDirs.push({ path, section });
  _cache = null; // invalidate
}

/** Clear file cache so the next lookup triggers a rescan. */
export function bustCache(): void {
  _cache = null;
}

/**
 * Recursively scan a directory, returning HelpEntry objects.
 *
 * @param dirPath     Directory to scan (may be a sub-path within resolvedRoot).
 * @param section     Section name for all entries found here.
 * @param prefix      Sub-topic prefix accumulated during recursion.
 * @param resolvedRoot Canonicalized root path — every file read must be
 *                    contained within this path to prevent symlink traversal.
 */
async function scanDir(
  dirPath: string,
  section: string,
  prefix: string,
  resolvedRoot: string,
): Promise<HelpEntry[]> {
  const entries: HelpEntry[] = [];

  let dirEntries: Deno.DirEntry[];
  try {
    dirEntries = [];
    for await (const e of Deno.readDir(dirPath)) {
      dirEntries.push(e);
    }
  } catch (e) {
    console.warn(`[help] Failed to read directory "${dirPath}": ${e}`);
    return entries;
  }

  for (const entry of dirEntries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = `${dirPath}/${entry.name}`;

    // ── Path containment check (C1 — symlink traversal defence) ──────────
    // Resolve the real path (follows symlinks) and verify it stays within the
    // registered root. This guards against .md symlinks that escape the root.
    let realPath: string;
    try {
      realPath = await Deno.realPath(fullPath);
    } catch {
      // Can't resolve (broken symlink, race condition, etc.) — skip safely
      console.warn(`[help] Cannot resolve path "${fullPath}" — skipping.`);
      continue;
    }

    const isContained =
      realPath === resolvedRoot ||
      realPath.startsWith(resolvedRoot + "/");

    if (!isContained) {
      console.warn(
        `[help] Skipping "${fullPath}" — resolves to "${realPath}" which is outside scan root "${resolvedRoot}".`,
      );
      continue;
    }
    // ── End containment check ─────────────────────────────────────────────

    if (entry.isDirectory) {
      const subSection = prefix
        ? `${prefix}/${entry.name.toLowerCase()}`
        : entry.name.toLowerCase();
      const subEntries = await scanDir(fullPath, section, subSection, resolvedRoot);
      entries.push(...subEntries);
      continue;
    }

    if (!entry.isFile) continue;
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt")) continue;

    const rawName = entry.name.replace(/\.(md|txt)$/, "").toLowerCase();
    const isIndex = rawName === "index" || rawName === "readme";
    const topicName = prefix ? `${prefix}/${rawName}` : rawName;

    let content: string;
    try {
      content = await Deno.readTextFile(fullPath);
    } catch (e) {
      console.warn(`[help] Failed to read file "${fullPath}": ${e}`);
      continue;
    }

    if (isIndex) {
      entries.push({
        name: slugify(prefix || section),
        section,
        content,
        source: "file",
        tags: [],
      });
    } else {
      entries.push({
        name: slugify(topicName),
        section,
        content,
        source: "file",
        tags: [],
      });
    }
  }

  return entries;
}

async function buildCache(): Promise<Map<string, HelpEntry>> {
  const map = new Map<string, HelpEntry>();
  const cwd = Deno.cwd();

  // ── Scan game-level root ./help/ ─────────────────────────────────────────
  let rootResolved: string | null = null;
  try {
    rootResolved = await Deno.realPath("./help");
  } catch {
    // ./help doesn't exist — fine, skip it silently
  }

  if (rootResolved) {
    const rootEntries = await scanDir("./help", "general", "", rootResolved);
    for (const entry of rootEntries) {
      map.set(entry.name, entry);
    }
  }

  // ── Scan plugin-registered dirs ───────────────────────────────────────────
  for (const dir of _registeredDirs) {
    let resolvedRoot: string;
    try {
      resolvedRoot = await Deno.realPath(dir.path);
    } catch (e) {
      console.warn(`[help] Registered help dir "${dir.path}" cannot be resolved — skipping: ${e}`);
      continue;
    }

    // H1 — warn when the registered path is outside the game working directory.
    // Plugins installed via JSR legitimately live outside cwd, so this is a
    // warning (not a hard rejection), but it surfaces accidental mis-registrations.
    if (!resolvedRoot.startsWith(cwd)) {
      console.warn(
        `[help] Registered help dir "${resolvedRoot}" is outside the game directory "${cwd}". ` +
          `This is expected for JSR-installed plugins but unusual otherwise.`,
      );
    }

    const entries = await scanDir(dir.path, dir.section, "", resolvedRoot);
    for (const entry of entries) {
      if (!map.has(entry.name)) {
        map.set(entry.name, entry);
      }
    }
  }

  return map;
}

export class FileProvider implements HelpProvider {
  readonly priority = 50;

  private async cache(): Promise<Map<string, HelpEntry>> {
    if (!_cache) _cache = await buildCache();
    return _cache;
  }

  async get(topic: string): Promise<HelpEntry | null> {
    const cache = await this.cache();
    return cache.get(topic) ?? null;
  }

  async all(): Promise<HelpEntry[]> {
    const cache = await this.cache();
    return Array.from(cache.values());
  }
}
