import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  WIKI_DIR, MAX_UPLOAD_BYTES,
  safePath, mimeForPath, serializePage,
  readPageFile, walkWiki,
} from "./fs.ts";
import type { WikiStub } from "./fs.ts";
import { isStaffUser } from "./db.ts";
import { canReadPageRest } from "./permissions.ts";
import { scanBacklinks } from "./backlinks.ts";
import { listHistory, readSnapshot, saveSnapshot } from "./history.ts";
import { wikiHooks } from "./hooks.ts";
import { subscriptions, MAX_PLAYER_SUBS } from "./db.ts";

const JSON_HDR = {
  "Content-Type":           "application/json",
  "X-Content-Type-Options": "nosniff",
};
const SAFE_KEY = /^[\w-]+$/;

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HDR });
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function wikiRouteHandler(req: Request, userId: string | null): Promise<Response> {
  const url    = new URL(req.url);
  const method = req.method;

  const rawPath = url.pathname.replace(/^\/api\/v1\/wiki\/?/, "").replace(/\/$/, "");

  // ── /tags ────────────────────────────────────────────────────────────────────
  if (rawPath === "tags" && method === "GET") return await handleTags(userId);

  // ── /<path>/history, /<path>/backlinks, /<path>/watch ────────────────────────
  const subMatch = rawPath.match(/^(.+)\/(history|backlinks|watch)$/);
  if (subMatch) {
    const [, wikiPath, sub] = subMatch;
    if (sub === "history")   return await handleHistory(wikiPath, method, userId);
    if (sub === "backlinks") return await handleBacklinks(wikiPath, method, userId);
    if (sub === "watch")     return await handleWatch(wikiPath, method, userId);
  }

  const searchQ = url.searchParams.get("q");
  const wikiPath = rawPath;

  // ── GET /api/v1/wiki?q= — full-text search ──────────────────────────────────
  if (method === "GET" && searchQ !== null) return await handleSearch(searchQ, userId);

  // ── GET /api/v1/wiki — list ──────────────────────────────────────────────────
  if (!wikiPath && method === "GET") return await handleList(userId);

  // ── POST /api/v1/wiki — create ───────────────────────────────────────────────
  if (!wikiPath && method === "POST") return await handleCreate(req, userId);

  if (!wikiPath) return json({ error: "Not Found" }, 404);

  const guarded = safePath(wikiPath);
  if (!guarded) return json({ error: "Invalid path" }, 400);

  if (method === "GET")    return await handleGet(wikiPath, guarded, userId);
  if (method === "PUT")    return await handlePut(wikiPath, guarded, req, userId);
  if (method === "PATCH")  return await handlePatch(wikiPath, req, userId);
  if (method === "DELETE") return await handleDelete(wikiPath, guarded, userId);

  return json({ error: "Not Found" }, 404);
}

// ─── handlers ─────────────────────────────────────────────────────────────────

async function handleTags(userId: string | null): Promise<Response> {
  const counts: Record<string, number> = {};
  for await (const { absPath } of walkWiki(resolve(WIKI_DIR))) {
    const page = await readPageFile(absPath);
    if (!page || !(await canReadPageRest(userId, page.meta))) continue;
    const tags = Array.isArray(page.meta.tags) ? (page.meta.tags as string[]) : [];
    for (const t of tags) counts[t] = (counts[t] ?? 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([tag, count]) => ({ tag, count }));
  return json(sorted);
}

async function handleSearch(q: string, userId: string | null): Promise<Response> {
  const lower = q.toLowerCase();
  const hits: WikiStub[] = [];
  for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
    const page = await readPageFile(absPath);
    if (!page || !(await canReadPageRest(userId, page.meta))) continue;
    const { meta, body } = page;
    const tags = Array.isArray(meta.tags) ? (meta.tags as string[]) : [];
    if (
      ((meta.title as string) || "").toLowerCase().includes(lower) ||
      body.toLowerCase().includes(lower) ||
      tags.some((t) => t.toLowerCase().includes(lower))
    ) {
      hits.push({ path: urlPath, title: (meta.title as string) || urlPath, type: "page" });
    }
  }
  return json(hits);
}

async function handleList(userId: string | null): Promise<Response> {
  const pages: WikiStub[] = [];
  for await (const { urlPath, absPath } of walkWiki(resolve(WIKI_DIR))) {
    const page = await readPageFile(absPath);
    if (!page || !(await canReadPageRest(userId, page.meta))) continue;
    pages.push({ path: urlPath, title: (page.meta.title as string) || urlPath, type: "page" });
  }
  return json(pages);
}

async function handleCreate(req: Request, userId: string | null): Promise<Response> {
  if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl) > MAX_UPLOAD_BYTES) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  const pagePath = typeof body.path === "string" ? body.path.replace(/\.md$/, "").trim() : "";
  const pageBody = typeof body.body === "string" ? body.body.trim() : "";
  if (!pagePath) return json({ error: "path is required" }, 400);
  if (!pageBody) return json({ error: "body is required" }, 400);

  const targetAbs = safePath(`${pagePath}.md`);
  if (!targetAbs) return json({ error: "Invalid path" }, 400);

  const { path: _p, body: _b, ...metaFields } = body;
  for (const key of Object.keys(metaFields)) {
    if (!SAFE_KEY.test(key)) return json({ error: `Invalid metadata key: "${key}"` }, 400);
  }

  await ensureDir(resolve(join(targetAbs, "..")));
  const content = serializePage(metaFields as Record<string, unknown>, pageBody);
  try {
    const file = await Deno.open(targetAbs, { write: true, createNew: true });
    await file.write(new TextEncoder().encode(content));
    file.close();
    await saveSnapshot(pagePath, content);
  } catch (e) {
    if (e instanceof Deno.errors.AlreadyExists) return json({ error: "Page already exists" }, 409);
    throw e;
  }
  await wikiHooks.emit("wiki:created", { path: pagePath, meta: metaFields, body: pageBody });
  return json({ path: pagePath, ...metaFields, body: pageBody }, 201);
}

async function handleGet(wikiPath: string, guarded: string, userId: string | null): Promise<Response> {
  const dotIdx = wikiPath.lastIndexOf(".");
  const ext    = dotIdx !== -1 ? wikiPath.slice(dotIdx).toLowerCase() : "";

  if (ext && ext !== ".md") {
    const mime = mimeForPath(wikiPath);
    if (!mime) return json({ error: "Unsupported file type" }, 415);
    try {
      const data = await Deno.readFile(guarded);
      const forceDownload = mime === "image/svg+xml" || mime === "application/pdf";
      return new Response(data, {
        headers: {
          "Content-Type":           mime,
          "Cache-Control":          "public, max-age=3600",
          "X-Content-Type-Options": "nosniff",
          ...(forceDownload ? { "Content-Disposition": "attachment" } : {}),
        },
      });
    } catch { return json({ error: "Not found" }, 404); }
  }

  for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
    if (!p) continue;
    const page = await readPageFile(p);
    if (!page) continue;
    if (!(await canReadPageRest(userId, page.meta))) return json({ error: "Forbidden" }, 403);
    return json({ path: wikiPath, ...page.meta, body: page.body });
  }

  const children: WikiStub[] = [];
  try {
    for await (const entry of Deno.readDir(guarded)) {
      if (entry.name === "README.md" || entry.name.startsWith(".")) continue;
      if (entry.isFile && entry.name.endsWith(".md")) {
        const slug      = entry.name.replace(/\.md$/, "");
        const childPath = slug === "index" ? wikiPath : `${wikiPath}/${slug}`;
        const page      = await readPageFile(join(guarded, entry.name));
        if (page && !(await canReadPageRest(userId, page.meta))) continue;
        children.push({ path: childPath, title: page ? (page.meta.title as string) || slug : slug, type: "page" });
      } else if (entry.isDirectory) {
        children.push({ path: `${wikiPath}/${entry.name}`, title: entry.name, type: "directory" });
      }
    }
  } catch { return json({ error: "Not found" }, 404); }

  if (!children.length) return json({ error: "Not found" }, 404);
  children.sort((a, b) => a.path.localeCompare(b.path));
  return json({ path: wikiPath, type: "directory", children });
}

async function handlePut(wikiPath: string, guarded: string, req: Request, userId: string | null): Promise<Response> {
  if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
  const mime = mimeForPath(wikiPath);
  if (!mime) return json({ error: "Unsupported file type" }, 415);
  const data = new Uint8Array(await req.arrayBuffer());
  if (!data.length)               return json({ error: "Empty file" }, 400);
  if (data.length > MAX_UPLOAD_BYTES) return json({ error: "File too large (max 10 MB)" }, 413);
  await ensureDir(resolve(join(guarded, "..")));
  await Deno.writeFile(guarded, data);
  return json({ path: wikiPath, size: data.length, type: mime }, 201);
}

async function handlePatch(wikiPath: string, req: Request, userId: string | null): Promise<Response> {
  if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
  const cl = req.headers.get("content-length");
  if (cl && parseInt(cl) > MAX_UPLOAD_BYTES) return json({ error: "Request body too large" }, 413);

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON body" }, 400); }

  let found: string | null = null;
  for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
    if (!p) continue;
    try { await Deno.stat(p); found = p; break; } catch { /* try next */ }
  }
  if (!found) return json({ error: "Not found" }, 404);

  const existing = await readPageFile(found);
  if (!existing) return json({ error: "Not found" }, 404);

  const { body: newBody, ...newMetaFields } = body;
  const updatedMeta = { ...existing.meta, ...(newMetaFields as Record<string, unknown>) };
  const updatedBody = typeof newBody === "string" ? newBody.trim() : existing.body;

  const rawBefore = await Deno.readTextFile(found);
  await saveSnapshot(wikiPath, rawBefore);
  await Deno.writeTextFile(found, serializePage(updatedMeta, updatedBody));
  await wikiHooks.emit("wiki:edited", { path: wikiPath, meta: updatedMeta, body: updatedBody });
  return json({ path: wikiPath, ...updatedMeta, body: updatedBody });
}

async function handleDelete(wikiPath: string, guarded: string, userId: string | null): Promise<Response> {
  if (!(await isStaffUser(userId))) return json({ error: "Forbidden" }, 403);
  const mime = mimeForPath(wikiPath);
  if (mime) {
    try { await Deno.remove(guarded); return json({ deleted: true }); }
    catch { return json({ error: "Not found" }, 404); }
  }
  for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
    if (!p) continue;
    try {
      const page = await readPageFile(p);
      await Deno.remove(p);
      const subs = await subscriptions.find({ path: wikiPath });
      for (const s of subs) await subscriptions.delete({ id: s.id });
      await wikiHooks.emit("wiki:deleted", { path: wikiPath, meta: page?.meta ?? {} });
      return json({ deleted: true });
    } catch { /* try next */ }
  }
  return json({ error: "Not found" }, 404);
}

async function handleHistory(wikiPath: string, method: string, userId: string | null): Promise<Response> {
  if (method !== "GET") return json({ error: "Method not allowed" }, 405);

  // Enforce the same readLock/draft check as GET /<path>.
  // Without this, anonymous users can enumerate snapshot timestamps for draft pages.
  for (const p of [safePath(`${wikiPath}.md`), safePath(`${wikiPath}/index.md`)]) {
    if (!p) continue;
    const page = await readPageFile(p);
    if (!page) continue;
    if (!(await canReadPageRest(userId, page.meta))) return json({ error: "Forbidden" }, 403);
    break;
  }

  const timestamps = await listHistory(wikiPath);
  return json({ path: wikiPath, snapshots: timestamps });
}

async function handleBacklinks(wikiPath: string, method: string, userId: string | null): Promise<Response> {
  if (method !== "GET") return json({ error: "Method not allowed" }, 405);
  const links = await scanBacklinks(wikiPath);
  // Filter by readLock
  const visible: WikiStub[] = [];
  for (const l of links) {
    if (l.meta && !(await canReadPageRest(userId, l.meta))) continue;
    visible.push(l);
  }
  return json({ path: wikiPath, backlinks: visible });
}

async function handleWatch(wikiPath: string, method: string, userId: string | null): Promise<Response> {
  if (method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const existing = await subscriptions.findOne({ playerId: userId, path: wikiPath });
  if (existing) {
    await subscriptions.delete({ id: existing.id });
    return json({ watching: false, path: wikiPath });
  }

  // Per-player cap: prevent one player from watching unlimited pages
  const playerSubs = await subscriptions.find({ playerId: userId });
  if (playerSubs.length >= MAX_PLAYER_SUBS) {
    return json({ error: `Subscription cap reached (${MAX_PLAYER_SUBS} pages per player)` }, 422);
  }

  const allWatchers = await subscriptions.find({ path: wikiPath });
  if (allWatchers.length >= 50) return json({ error: "Watcher cap reached (50)" }, 422);

  await subscriptions.create({ id: crypto.randomUUID(), playerId: userId, path: wikiPath, createdAt: Date.now() });
  return json({ watching: true, path: wikiPath }, 201);
}

// ─── snapshot REST ────────────────────────────────────────────────────────────

export { readSnapshot };
