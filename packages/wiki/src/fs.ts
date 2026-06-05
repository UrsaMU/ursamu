import { join, resolve } from "@std/path";

// ─── config ───────────────────────────────────────────────────────────────────

/** Root directory for wiki content. Relative to server CWD. */
export const WIKI_DIR = "./wiki";

/** Maximum size for uploaded static assets. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed static asset extensions → MIME types. */
export const ALLOWED_MEDIA_TYPES: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".gif":  "image/gif",
  ".webp": "image/webp",
  ".svg":  "image/svg+xml",
  ".pdf":  "application/pdf",
};

// ─── types ────────────────────────────────────────────────────────────────────

export type WikiMeta = Record<string, unknown>;

export interface WikiStub {
  path:  string;
  title: string;
  type:  "page" | "directory";
  meta?: WikiMeta;
}

// ─── path safety ─────────────────────────────────────────────────────────────

/**
 * Resolve a wiki URL path to an absolute filesystem path.
 * Returns null if the result escapes WIKI_DIR (path traversal guard).
 */
export function safePath(urlPath: string): string | null {
  if (urlPath.startsWith("/")) return null;  // reject absolute paths
  const base   = resolve(WIKI_DIR);
  const target = resolve(join(WIKI_DIR, urlPath));
  return target === base || target.startsWith(base + "/") ? target : null;
}

/** Returns the MIME type for a file path based on extension, or null if unsupported. */
export function mimeForPath(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return ALLOWED_MEDIA_TYPES[ext] ?? null;
}

// ─── frontmatter ─────────────────────────────────────────────────────────────

/**
 * Quote-aware array value parser.
 * Handles both `[unquoted, items]` and `["quoted, with commas", 'single-quoted']`.
 * Commas inside quoted strings are not treated as delimiters.
 */
function parseArrayItems(inner: string): string[] {
  const items: string[] = [];
  let current = "";
  let inQuote: string | null = null;

  for (const ch of inner) {
    if (inQuote) {
      if (ch === inQuote) { inQuote = null; }
      else                { current += ch; }
    } else if (ch === '"' || ch === "'") {
      inQuote = ch;
    } else if (ch === ",") {
      const t = current.trim();
      if (t) items.push(t);
      current = "";
    } else {
      current += ch;
    }
  }
  const last = current.trim();
  if (last) items.push(last);
  return items;
}

/** Parse YAML-ish frontmatter from a markdown file. */
export function parseFrontmatter(raw: string): { meta: WikiMeta; body: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(raw);
  if (!match) return { meta: {}, body: raw.trim() };

  const meta: WikiMeta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (val === "true")  { meta[key] = true;  continue; }
    if (val === "false") { meta[key] = false; continue; }
    if (val !== "" && !isNaN(Number(val))) { meta[key] = Number(val); continue; }
    if (val.startsWith("[") && val.endsWith("]")) {
      // Quote-aware parser: commas inside "..." or '...' are not delimiters
      meta[key] = parseArrayItems(val.slice(1, -1));
      continue;
    }
    meta[key] = val.replace(/^["']|["']$/g, "");
  }

  return { meta, body: match[2].trim() };
}

/** Serialize frontmatter + body back to markdown string. */
export function serializePage(meta: WikiMeta, body: string): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) {
      // Quote string items that contain commas so round-trip parsing is lossless
      const items = (v as unknown[]).map((item) =>
        typeof item === "string" && item.includes(",")
          ? `"${item.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"` : String(item)
      );
      lines.push(`${k}: [${items.join(", ")}]`);
    }
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

// ─── directory walker ─────────────────────────────────────────────────────────

/**
 * Walk the wiki directory recursively, yielding `{ urlPath, absPath }` for
 * every `.md` file (skips README.md and dot-files).
 */
export async function* walkWiki(
  dir: string,
  prefix = ""
): AsyncGenerator<{ urlPath: string; absPath: string }> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch { return; }

  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    const abs     = join(dir, entry.name);
    const relPart = prefix ? `${prefix}/${entry.name}` : entry.name;

    if (entry.isDirectory) {
      yield* walkWiki(abs, relPart);
    } else if (entry.isFile && entry.name.endsWith(".md") && entry.name !== "README.md") {
      const urlPath = relPart.replace(/\.md$/, "").replace(/\/index$/, "") || prefix;
      yield { urlPath, absPath: abs };
    }
  }
}

/** Read and parse a single wiki page file. Returns null on failure. */
export async function readPageFile(absPath: string): Promise<{ meta: WikiMeta; body: string } | null> {
  try {
    return parseFrontmatter(await Deno.readTextFile(absPath));
  } catch { return null; }
}

/** Find the absolute path of a page file for a given wiki path (tries .md then /index.md). */
export async function findPageFile(wikiPath: string): Promise<string | null> {
  const base = resolve(WIKI_DIR);
  for (const rel of [`${wikiPath}.md`, `${wikiPath}/index.md`]) {
    const abs = resolve(join(WIKI_DIR, rel));
    if (!abs.startsWith(base)) continue;
    try { await Deno.stat(abs); return abs; } catch { /* try next */ }
  }
  return null;
}

/** Normalise a raw path arg: strip leading slashes, collapse doubles, strip trailing. */
export function normalisePath(raw: string): string {
  return raw.replace(/^\/+/, "").replace(/\/+/g, "/").replace(/\/$/, "");
}
