/**
 * FileProvider — aggregates markdown help files from:
 *   1. ./help/              (game-level root, always scanned)
 *   2. Any directory registered via registerHelpDir()
 *
 * registerHelpDir accepts:
 *   - Absolute filesystem paths (local / file: plugins)
 *   - file: URLs
 *   - https://jsr.io/@scope/pkg/ver/... URLs
 *   - Deno JSR pathnames (/@scope/pkg/ver/...) from
 *     `new URL("./help", import.meta.url).pathname`
 *
 * JSR packages store help as remote assets (not on a real FS).
 * Those are loaded via the package `_meta.json` manifest + fetch.
 *
 * Priority 50 — below DB (100) but above CommandProvider (10).
 */

import type { HelpEntry, HelpProvider } from "../registry.ts";
import { slugify } from "../registry.ts";

interface RegisteredDir {
  /** Filesystem path, or "" when remote-only. */
  path: string;
  /**
   * Remote base URL ending with /, e.g.
   * https://jsr.io/@ursamu/mail/2.4.0/help/
   */
  baseUrl?: string;
  section: string;
}

const _registeredDirs: RegisteredDir[] = [];
let _cache: Map<string, HelpEntry> | null = null;
/** In-flight build — coalesces concurrent cache() callers. */
let _build: Promise<Map<string, HelpEntry>> | null = null;

/** True for Deno's virtual JSR pathname form: /@scope/name/ver/... */
function isJsrPathname(p: string): boolean {
  return /^\/@[^/]+\/[^/]+\//.test(p);
}

/**
 * Normalize a registerHelpDir argument into fs path and/or remote URL.
 */
function resolveRegistration(
  path: string | URL,
): { path: string; baseUrl?: string } | null {
  if (path instanceof URL) {
    if (path.protocol === "file:") {
      return { path: path.pathname };
    }
    if (path.protocol === "https:" || path.protocol === "http:") {
      const href = path.href.endsWith("/") ? path.href : `${path.href}/`;
      return { path: "", baseUrl: href };
    }
    return null;
  }

  const raw = String(path);

  if (raw.startsWith("file:")) {
    try {
      return { path: new URL(raw).pathname };
    } catch {
      return { path: raw };
    }
  }

  if (raw.startsWith("https://") || raw.startsWith("http://")) {
    const href = raw.endsWith("/") ? raw : `${raw}/`;
    return { path: "", baseUrl: href };
  }

  // Plugins often pass `.pathname` of a JSR import.meta.url, which
  // yields `/@scope/pkg/ver/help` with no protocol. Reconstruct.
  if (isJsrPathname(raw)) {
    const href = `https://jsr.io${raw.endsWith("/") ? raw : `${raw}/`}`;
    return { path: "", baseUrl: href };
  }

  // Reject bare http-looking leftovers and npm-style virtual roots
  if (
    raw.startsWith("http:") ||
    raw.startsWith("https:") ||
    raw.startsWith("/http")
  ) {
    return null;
  }

  return { path: raw };
}

/**
 * Register a directory to be scanned for help files.
 * Call this in your plugin's init() to include your plugin's help/ folder.
 *
 * Prefer passing a URL so JSR and file: both work:
 *   registerHelpDir(new URL("./help", import.meta.url), "mail");
 *
 * `.pathname` still works for local file: plugins and for JSR
 * (pathname `/@scope/pkg/ver/help` is reconstructed to jsr.io).
 *
 * @param path    Absolute path, file:/https: URL, or JSR pathname
 * @param section Section name for all topics in this directory
 */
export function registerHelpDir(
  path: string | URL,
  section: string,
): void {
  const resolved = resolveRegistration(path);
  if (!resolved) return;
  if (!resolved.path && !resolved.baseUrl) return;

  // Dedupe — plugins may re-init; avoid stacking identical dirs.
  const exists = _registeredDirs.some(
    (d) =>
      d.section === section &&
      d.path === resolved.path &&
      d.baseUrl === resolved.baseUrl,
  );
  if (exists) return;

  _registeredDirs.push({
    path: resolved.path,
    baseUrl: resolved.baseUrl,
    section,
  });
  _cache = null;
  _build = null;
}

/** Clear file cache so the next lookup triggers a rescan. */
export function bustCache(): void {
  _cache = null;
  _build = null;
}

/** True if any path segment is underscore-prefixed (_admin, _draft.md). */
function pathImpliesHidden(relativePath: string): boolean {
  return relativePath
    .replace(/^\//, "")
    .split("/")
    .some((seg) => seg.startsWith("_"));
}

/** Truthy YAML scalar: true / yes / 1 (case-insensitive). */
function isYamlTrue(value: string): boolean {
  const v = value.trim().toLowerCase();
  return v === "true" || v === "yes" || v === "1";
}

/**
 * Parse optional YAML frontmatter from markdown content.
 *
 * Hide keys (any one is enough):
 *   hidden: true
 *   dark: true     (help-file convention / Claude.md)
 */
function parseFrontmatter(raw: string): {
  content: string;
  hidden: boolean;
  tags: string[];
  aliases: string[];
  section?: string;
  topic?: string;
} {
  let content = raw;
  let hidden = false;
  let tags: string[] = [];
  let aliases: string[] = [];
  let section: string | undefined;
  let topic: string | undefined;

  if (!content.startsWith("---")) {
    return { content, hidden, tags, aliases };
  }

  // Allow EOF right after closing --- (body may be empty).
  const fmMatch = content.match(
    /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/,
  );
  if (!fmMatch) return { content, hidden, tags, aliases };

  const yaml = fmMatch[1];
  content = fmMatch[2];

  for (const line of yaml.split("\n")) {
    const parts = line.split(":");
    if (parts.length < 2) continue;
    const key = parts[0].trim().toLowerCase();
    const value = parts.slice(1).join(":").trim();

    if ((key === "hidden" || key === "dark") && isYamlTrue(value)) {
      hidden = true;
    } else if (key === "tags" || key === "aliases") {
      const list = value
        .replace(/[\[\]]/g, "")
        .split(",")
        .map((t) => slugify(t.trim()))
        .filter(Boolean);
      if (key === "tags") tags = list;
      else aliases = list;
    } else if (key === "section" && value) {
      section = slugify(value.replace(/^["']|["']$/g, ""));
    } else if (key === "topic" && value) {
      topic = slugify(value.replace(/^["']|["']$/g, ""));
    }
  }

  return { content, hidden, tags, aliases, section, topic };
}

function entryFromFile(
  relativePath: string,
  section: string,
  raw: string,
): HelpEntry {
  // relativePath uses / separators, no leading slash, may include dirs
  const cleaned = relativePath.replace(/^\//, "");
  const noExt = cleaned.replace(/\.(md|txt)$/i, "");
  const parts = noExt.split("/").filter(Boolean);
  const rawName = (parts.pop() ?? "index").toLowerCase();
  const prefix = parts.map((p) => p.toLowerCase()).join("/");
  const isIndex = rawName === "index" || rawName === "readme";
  const topicName = prefix
    ? (isIndex ? prefix : `${prefix}/${rawName}`)
    : (isIndex ? section : rawName);

  const fm = parseFrontmatter(raw);
  const hidden = fm.hidden || pathImpliesHidden(cleaned);
  const name = slugify(
    fm.topic ||
      (isIndex && !prefix ? section : topicName),
  );
  const resolvedSection = fm.section || section;
  const tags = [...new Set([...fm.tags, ...fm.aliases])];

  return {
    name,
    section: resolvedSection,
    content: fm.content,
    source: "file",
    tags,
    hidden,
  };
}

/**
 * Recursively scan a directory, returning HelpEntry objects.
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
    console.warn(
      `[help] Failed to read directory "${dirPath}": ${e}`,
    );
    return entries;
  }

  for (const entry of dirEntries) {
    if (entry.name.startsWith(".")) continue;

    const fullPath = `${dirPath}/${entry.name}`;

    let realPath: string;
    try {
      realPath = await Deno.realPath(fullPath);
    } catch {
      console.warn(
        `[help] Cannot resolve path "${fullPath}" — skipping.`,
      );
      continue;
    }

    const isContained =
      realPath === resolvedRoot ||
      realPath.startsWith(resolvedRoot + "/");

    if (!isContained) {
      console.warn(
        `[help] Skipping "${fullPath}" — resolves to ` +
          `"${realPath}" outside scan root "${resolvedRoot}".`,
      );
      continue;
    }

    if (entry.isDirectory) {
      const subSection = prefix
        ? `${prefix}/${entry.name.toLowerCase()}`
        : entry.name.toLowerCase();
      const subEntries = await scanDir(
        fullPath,
        section,
        subSection,
        resolvedRoot,
      );
      entries.push(...subEntries);
      continue;
    }

    if (!entry.isFile) continue;
    if (!entry.name.endsWith(".md") && !entry.name.endsWith(".txt")) {
      continue;
    }

    let content: string;
    try {
      content = await Deno.readTextFile(fullPath);
    } catch (e) {
      console.warn(
        `[help] Failed to read file "${fullPath}": ${e}`,
      );
      continue;
    }

    const rel = prefix
      ? `${prefix}/${entry.name}`
      : entry.name;
    entries.push(entryFromFile(rel, section, content));
  }

  return entries;
}

/**
 * Load help files published inside a JSR package via _meta.json.
 *
 * baseUrl example:
 *   https://jsr.io/@ursamu/mail/2.4.0/help/
 */
async function scanJsrHelp(
  baseUrl: string,
  section: string,
): Promise<HelpEntry[]> {
  const entries: HelpEntry[] = [];

  const m = baseUrl.match(
    /^https?:\/\/jsr\.io\/(@[^/]+\/[^/]+)\/([^/]+)\/(.*)$/,
  );
  if (!m) {
    console.warn(
      `[help] Not a JSR help URL, skipping: ${baseUrl}`,
    );
    return entries;
  }

  const pkg = m[1]; // @ursamu/mail
  const ver = m[2]; // 2.4.0
  const sub = m[3].replace(/\/+$/, ""); // help
  const prefix = `/${sub}`; // /help

  const metaUrl = `https://jsr.io/${pkg}/${ver}_meta.json`;
  let manifest: Record<string, unknown> = {};
  try {
    const res = await fetch(metaUrl);
    if (!res.ok) {
      console.warn(
        `[help] JSR meta ${metaUrl} → HTTP ${res.status}`,
      );
      return entries;
    }
    const json = await res.json() as {
      manifest?: Record<string, unknown>;
    };
    manifest = json.manifest ?? {};
  } catch (e: unknown) {
    console.warn(
      `[help] Failed to fetch JSR meta ${metaUrl}: ${e}`,
    );
    return entries;
  }

  const mdKeys = Object.keys(manifest).filter((k) => {
    if (!k.startsWith(prefix + "/") && k !== prefix) return false;
    return k.endsWith(".md") || k.endsWith(".txt");
  });

  if (mdKeys.length === 0) {
    console.warn(
      `[help] JSR package ${pkg}@${ver} has no .md under ` +
        `${prefix}/ — was help/ included in publish?`,
    );
    return entries;
  }

  console.log(
    `[help] Loading ${mdKeys.length} topic(s) from ` +
      `${pkg}@${ver}${prefix}/`,
  );

  // Parallel fetch — sequential cold loads of large packages
  // (e.g. cofd ~140 files) stall the event loop for seconds.
  const settled = await Promise.all(
    mdKeys.map(async (filePath) => {
      const url = `https://jsr.io/${pkg}/${ver}${filePath}`;
      try {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(
            `[help] JSR fetch ${url} → HTTP ${res.status}`,
          );
          return null;
        }
        const raw = await res.text();
        const rel = filePath
          .slice(prefix.length)
          .replace(/^\//, "");
        if (!rel) return null;
        return entryFromFile(rel, section, raw);
      } catch (e: unknown) {
        console.warn(`[help] JSR fetch failed ${url}: ${e}`);
        return null;
      }
    }),
  );

  for (const entry of settled) {
    if (entry) entries.push(entry);
  }

  return entries;
}

async function buildCache(): Promise<Map<string, HelpEntry>> {
  const map = new Map<string, HelpEntry>();
  const cwd = Deno.cwd();

  // ── Optional game-level ./help/ (site-specific overrides only) ──
  // Plugin topics come from registerHelpDir (package help/), not
  // a vendored copy of every package under the game root.
  let rootResolved: string | null = null;
  try {
    rootResolved = await Deno.realPath("./help");
  } catch {
    // ./help doesn't exist — fine
  }

  if (rootResolved) {
    const rootEntries = await scanDir(
      "./help",
      "general",
      "",
      rootResolved,
    );
    for (const entry of rootEntries) {
      map.set(entry.name, entry);
    }
  }

  // ── Plugin-registered dirs (file: checkout or JSR https://) ────
  // Load in parallel; single-flight cache() coalesces callers.
  const batches = await Promise.all(
    _registeredDirs.map(async (dir) => {
      if (dir.baseUrl) {
        return await scanJsrHelp(dir.baseUrl, dir.section);
      }
      if (!dir.path) return [] as HelpEntry[];

      let resolvedRoot: string;
      try {
        resolvedRoot = await Deno.realPath(dir.path);
      } catch (e) {
        console.warn(
          `[help] Registered help dir "${dir.path}" cannot ` +
            `be resolved — skipping: ${e}`,
        );
        return [] as HelpEntry[];
      }

      if (!resolvedRoot.startsWith(cwd)) {
        console.warn(
          `[help] Registered help dir "${resolvedRoot}" is ` +
            `outside the game directory "${cwd}". Expected ` +
            `for JSR/local plugin checkouts.`,
        );
      }

      return await scanDir(
        dir.path,
        dir.section,
        "",
        resolvedRoot,
      );
    }),
  );

  // Plugin files win over game-root on name collision only when
  // game root did not already define the topic (overrides first).
  for (const entries of batches) {
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
    if (_cache) return _cache;
    if (!_build) {
      _build = buildCache()
        .then((m) => {
          _cache = m;
          _build = null;
          return m;
        })
        .catch((e: unknown) => {
          _build = null;
          throw e;
        });
    }
    return _build;
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
