import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import { dbojs } from "../../services/Database/index.ts";
import { wikiHooks } from "./hooks.ts";

// ─── config ───────────────────────────────────────────────────────────────────

/** Root directory for wiki content. Relative to server CWD. */
export const WIKI_DIR = "./wiki";

/** Maximum size for uploaded files. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MB

/** Allowed static asset types and their MIME types. */
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

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

/** Returns the MIME type for a path based on its extension, or null if not allowed. */
export function mimeForPath(filePath: string): string | null {
  const ext = filePath.slice(filePath.lastIndexOf(".")).toLowerCase();
  return ALLOWED_MEDIA_TYPES[ext] ?? null;
}

/**
 * Resolve a wiki URL path to an absolute filesystem path, returning null if
 * the result escapes the wiki directory (path traversal guard).
 */
export function safePath(urlPath: string): string | null {
  const base   = resolve(WIKI_DIR);
  const target = resolve(join(WIKI_DIR, urlPath));
  return target === base || target.startsWith(base + "/") ? target : null;
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
      meta[key] = val.slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^["']|["']$/g, ""))
        .filter(Boolean);
      continue;
    }
    meta[key] = val.replace(/^["']|["']$/g, "");
  }

  return { meta, body: match[2].trim() };
}

/** Serialise metadata + body back into a frontmatter markdown string. */
export function serializePage(meta: WikiMeta, body: string): string {
  const lines = ["---"];
  for (const [k, v] of Object.entries(meta)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) lines.push(`${k}: [${(v as unknown[]).join(", ")}]`);
    else lines.push(`${k}: ${v}`);
  }
  lines.push("---", "", body.trim(), "");
  return lines.join("\n");
}

/**
 * Walk the wiki directory recursively, yielding `{ urlPath, absPath }` for
 * every `.md` file (README.md excluded).
 */
export async function* walkWiki(
  dir: string,
  prefix = ""
): AsyncGenerator<{ urlPath: string; absPath: string }> {
  let entries: Deno.DirEntry[];
  try {
    entries = [];
    for await (const e of Deno.readDir(dir)) entries.push(e);
  } catch {
    return;
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));

  for (const entry of entries) {
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

export async function readPageFile(absPath: string): Promise<{ meta: WikiMeta; body: string } | null> {
  try {
    const raw = await Deno.readTextFile(absPath);
    return parseFrontmatter(raw);
  } catch {
    return null;
  }
}

async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = (player.flags as unknown as string) || "";
  return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function wikiRouteHandler(
  req: Request,
  userId: string | null
): Promise<Response> {
  const url    = new URL(req.url);
  const method = req.method;

  // Strip /api/v1/wiki[/] prefix → "news/battle-2026" or ""
  const wikiPath = url.pathname
    .replace(/^\/api\/v1\/wiki\/?/, "")
    .replace(/\/$/, "");

  const searchQ = url.searchParams.get("q");

  // ── GET /api/v1/wiki?q=<query> — full-text search ──────────────────────────
  if (method === "GET" && searchQ !== null) {
    const q = searchQ.toLowerCase();
    const hits: WikiStub[] = [];
    for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
      const page = await readPageFile(absPath);
      if (!page) continue;
      const { meta, body } = page;
      const titleMatch = ((meta.title as string) || "").toLowerCase().includes(q);
      const bodyMatch  = body.toLowerCase().includes(q);
      const tagMatch   = (Array.isArray(meta.tags) ? meta.tags as string[] : [])
        .some((t) => t.toLowerCase().includes(q));
      if (titleMatch || bodyMatch || tagMatch) {
        hits.push({ path: urlPath, title: (meta.title as string) || urlPath, type: "page" });
      }
    }
    return jsonResponse(hits);
  }

  // ── GET /api/v1/wiki — list all pages ──────────────────────────────────────
  if (!wikiPath && method === "GET") {
    const pages: WikiStub[] = [];
    for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
      const page = await readPageFile(absPath);
      if (!page) continue;
      pages.push({ path: urlPath, title: (page.meta.title as string) || urlPath, type: "page" });
    }
    return jsonResponse(pages);
  }

  // ── POST /api/v1/wiki — create a page ──────────────────────────────────────
  if (!wikiPath && method === "POST") {
    if (!(await isStaffUser(userId))) return jsonResponse({ error: "Forbidden" }, 403);

    // Guard against oversized request bodies before buffering.
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl) > MAX_UPLOAD_BYTES) return jsonResponse({ error: "Request body too large" }, 413);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    const pagePath = typeof body.path === "string" ? body.path.replace(/\.md$/, "").trim() : "";
    const pageBody = typeof body.body === "string" ? body.body.trim() : "";
    if (!pagePath) return jsonResponse({ error: "path is required" }, 400);
    if (!pageBody) return jsonResponse({ error: "body is required" }, 400);

    const targetAbs = safePath(`${pagePath}.md`);
    if (!targetAbs) return jsonResponse({ error: "Invalid path" }, 400);

    const { path: _p, body: _b, ...meta } = body;

    // Validate metadata keys — only word characters and hyphens allowed.
    const SAFE_KEY = /^[\w-]+$/;
    for (const key of Object.keys(meta)) {
      if (!SAFE_KEY.test(key)) return jsonResponse({ error: `Invalid metadata key: "${key}"` }, 400);
    }

    // Atomic create — fails if the file already exists (no TOCTOU window).
    await ensureDir(resolve(join(targetAbs, "..")));
    try {
      const file = await Deno.open(targetAbs, { write: true, createNew: true });
      await file.write(new TextEncoder().encode(serializePage(meta as WikiMeta, pageBody)));
      file.close();
    } catch (e) {
      if (e instanceof Deno.errors.AlreadyExists) return jsonResponse({ error: "Page already exists" }, 409);
      throw e;
    }
    await wikiHooks.emit("wiki:created", { path: pagePath, meta: meta as WikiMeta, body: pageBody });
    return jsonResponse({ path: pagePath, ...meta, body: pageBody }, 201);
  }

  if (!wikiPath) return jsonResponse({ error: "Not Found" }, 404);

  // Path traversal guard for all remaining routes
  const guardedBase = safePath(wikiPath);
  if (!guardedBase) return jsonResponse({ error: "Invalid path" }, 400);

  // ── GET /api/v1/wiki/<path> — page, directory, or static asset ─────────────
  if (method === "GET") {
    // Static asset: anything with a non-.md extension
    const dotIdx = wikiPath.lastIndexOf(".");
    const ext    = dotIdx !== -1 ? wikiPath.slice(dotIdx).toLowerCase() : "";

    if (ext && ext !== ".md") {
      const mime = mimeForPath(wikiPath);
      if (!mime) return jsonResponse({ error: "Unsupported file type" }, 415);
      try {
        const data = await Deno.readFile(guardedBase);
        return new Response(data, {
          headers: {
            "Content-Type": mime,
            "Cache-Control": "public, max-age=3600",
          },
        });
      } catch {
        return jsonResponse({ error: "Not found" }, 404);
      }
    }

    // 1. Exact .md file: wiki/news/battle.md
    const exactMd = safePath(`${wikiPath}.md`);
    if (exactMd) {
      const page = await readPageFile(exactMd);
      if (page) return jsonResponse({ path: wikiPath, ...page.meta, body: page.body });
    }

    // 2. index.md inside directory: wiki/news/index.md
    const indexMd = safePath(`${wikiPath}/index.md`);
    if (indexMd) {
      const page = await readPageFile(indexMd);
      if (page) return jsonResponse({ path: wikiPath, ...page.meta, body: page.body });
    }

    // 3. Directory listing: wiki/news/
    const children: WikiStub[] = [];
    try {
      for await (const entry of Deno.readDir(guardedBase)) {
        if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
        if (entry.isFile && entry.name.endsWith(".md")) {
          const slug      = entry.name.replace(/\.md$/, "");
          const childPath = slug === "index" ? wikiPath : `${wikiPath}/${slug}`;
          const page      = await readPageFile(join(guardedBase, entry.name));
          children.push({
            path:  childPath,
            title: page ? (page.meta.title as string) || slug : slug,
            type:  "page",
          });
        } else if (entry.isDirectory) {
          children.push({ path: `${wikiPath}/${entry.name}`, title: entry.name, type: "directory" });
        }
      }
    } catch {
      return jsonResponse({ error: "Not found" }, 404);
    }

    if (!children.length) return jsonResponse({ error: "Not found" }, 404);
    children.sort((a, b) => a.path.localeCompare(b.path));
    return jsonResponse({ path: wikiPath, type: "directory", children });
  }

  // ── PUT /api/v1/wiki/<path> — upload a static asset ────────────────────────
  if (method === "PUT") {
    if (!(await isStaffUser(userId))) return jsonResponse({ error: "Forbidden" }, 403);

    const mime = mimeForPath(wikiPath);
    if (!mime) return jsonResponse({ error: "Unsupported file type" }, 415);

    const data = new Uint8Array(await req.arrayBuffer());
    if (data.length === 0)               return jsonResponse({ error: "Empty file" }, 400);
    if (data.length > MAX_UPLOAD_BYTES)  return jsonResponse({ error: "File too large (max 10 MB)" }, 413);

    await ensureDir(resolve(join(guardedBase, "..")));
    await Deno.writeFile(guardedBase, data);
    return jsonResponse({ path: wikiPath, size: data.length, type: mime }, 201);
  }

  // ── PATCH /api/v1/wiki/<path> — update a page ──────────────────────────────
  if (method === "PATCH") {
    if (!(await isStaffUser(userId))) return jsonResponse({ error: "Forbidden" }, 403);

    // Guard against oversized request bodies before buffering.
    const cl = req.headers.get("content-length");
    if (cl && parseInt(cl) > MAX_UPLOAD_BYTES) return jsonResponse({ error: "Request body too large" }, 413);

    let body: Record<string, unknown>;
    try { body = await req.json(); }
    catch { return jsonResponse({ error: "Invalid JSON body" }, 400); }

    let found: string | null = null;
    for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
      if (!p) continue;
      try { await Deno.stat(p); found = p; break; } catch { /* try next */ }
    }
    if (!found) return jsonResponse({ error: "Not found" }, 404);

    const existing = await readPageFile(found);
    if (!existing) return jsonResponse({ error: "Not found" }, 404);

    const { body: newBody, ...newMetaFields } = body;
    const updatedMeta = { ...existing.meta, ...(newMetaFields as WikiMeta) };
    const updatedBody = typeof newBody === "string" ? newBody.trim() : existing.body;

    await Deno.writeTextFile(found, serializePage(updatedMeta, updatedBody));
    await wikiHooks.emit("wiki:edited", { path: wikiPath, meta: updatedMeta, body: updatedBody });
    return jsonResponse({ path: wikiPath, ...updatedMeta, body: updatedBody });
  }

  // ── DELETE /api/v1/wiki/<path> — remove a page or asset ────────────────────
  if (method === "DELETE") {
    if (!(await isStaffUser(userId))) return jsonResponse({ error: "Forbidden" }, 403);

    // Static asset
    const mime = mimeForPath(wikiPath);
    if (mime) {
      try { await Deno.remove(guardedBase); return jsonResponse({ deleted: true }); }
      catch { return jsonResponse({ error: "Not found" }, 404); }
    }

    // Markdown page
    for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
      if (!p) continue;
      try {
        const page = await readPageFile(p);
        await Deno.remove(p);
        await wikiHooks.emit("wiki:deleted", { path: wikiPath, meta: page?.meta ?? {} });
        return jsonResponse({ deleted: true });
      } catch { /* try next */ }
    }
    return jsonResponse({ error: "Not found" }, 404);
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
