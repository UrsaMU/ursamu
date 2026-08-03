/**
 * Serve the staff web console under /admin/ (and legacy
 * /admin/wiki/).
 *
 * Prefers dist/ (Vite build); falls back to admin/.
 * Works for local file:// and JSR https:// modules.
 */

import {
  join,
  normalize,
  fromFileUrl,
  relative,
  isAbsolute,
} from "@std/path";
import {
  getStaffStaticRoot,
  safeJoinStaffStatic,
} from "./staff-static.ts";

const DIST_URL = new URL("../dist/", import.meta.url);
const FALLBACK_URL = new URL("../admin/", import.meta.url);

function isFileUrl(u: URL): boolean {
  return u.protocol === "file:";
}

function fileRoot(u: URL): string {
  return normalize(fromFileUrl(u));
}

async function resolveFileRoot(): Promise<string | null> {
  if (!isFileUrl(DIST_URL)) return null;
  const dist = fileRoot(DIST_URL);
  try {
    if ((await Deno.stat(join(dist, "index.html"))).isFile) {
      return dist;
    }
  } catch { /* missing */ }
  return isFileUrl(FALLBACK_URL) ? fileRoot(FALLBACK_URL) : null;
}

function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" ||
    (!rel.startsWith("..") && !isAbsolute(rel));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
  ".ttf": "font/ttf",
  ".webp": "image/webp",
};

/**
 * Relative SPA path under /admin/ or /admin/wiki/.
 * Returns null on traversal / invalid paths.
 */
export function spaRelPath(pathname: string): string | null {
  let rel = pathname
    .replace(/^\/admin\/wiki\/?/, "")
    .replace(/^\/admin\/?/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  rel = rel.replace(/\\/g, "/");
  if (
    rel.includes("\0") ||
    rel.startsWith("/") ||
    /^[a-zA-Z]:/.test(rel)
  ) {
    return null;
  }
  if (!rel || rel.endsWith("/")) rel += "index.html";
  // SPA fallback: bare routes without extension → index.html
  if (!rel.includes(".")) rel = "index.html";

  const parts = rel.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === ".")) return null;
  return parts.join("/");
}

/**
 * Map /admin or /admin/wiki URL path to a file under SPA root
 * (local filesystem roots only — used by tests).
 */
export function resolveAdminFile(
  pathname: string,
  root: string,
): string | null {
  const rel = spaRelPath(pathname);
  if (rel === null) return null;
  const base = normalize(root);
  const target = normalize(join(root, ...rel.split("/")));
  if (!isInside(base, target)) return null;
  return target;
}

function mimeFor(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1
    ? ""
    : filePath.slice(dot).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

function headersFor(pathOrName: string): Headers {
  return new Headers({
    "Content-Type": mimeFor(pathOrName),
    "Cache-Control": "no-cache",
    "X-Content-Type-Options": "nosniff",
  });
}

async function readRemote(
  base: URL,
  rel: string,
): Promise<Uint8Array | null> {
  const url = new URL(rel, base);
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function readLocal(
  root: string,
  rel: string,
): Promise<Uint8Array | null> {
  try {
    return await Deno.readFile(join(root, ...rel.split("/")));
  } catch {
    return null;
  }
}

async function withSpaFallback(
  load: (r: string) => Promise<Uint8Array | null>,
  rel: string,
): Promise<{ data: Uint8Array; name: string } | null> {
  const data = await load(rel);
  if (data) return { data, name: rel };
  if (rel === "index.html") return null;
  const idx = await load("index.html");
  return idx ? { data: idx, name: "index.html" } : null;
}

async function loadAsset(
  rel: string,
): Promise<{ data: Uint8Array; name: string } | null> {
  const fileRootPath = await resolveFileRoot();
  if (fileRootPath) {
    return withSpaFallback(
      (r) => readLocal(fileRootPath, r),
      rel,
    );
  }
  for (const base of [DIST_URL, FALLBACK_URL]) {
    const hit = await withSpaFallback(
      (r) => readRemote(base, r),
      rel,
    );
    if (hit) return hit;
  }
  return null;
}

/** Serve plugin static registered via registerStaffStatic. */
async function serveStaffPluginStatic(
  pathname: string,
  method: string,
): Promise<Response | null> {
  // /admin/<id> or /admin/<id>/…
  const m = pathname.match(
    /^\/admin\/([a-z][a-z0-9_-]*)(?:\/(.*))?$/i,
  );
  if (!m) return null;
  const id = m[1]!.toLowerCase();
  const root = getStaffStaticRoot(id);
  if (!root) return null;

  let sub = (m[2] ?? "").replace(/\\/g, "/");
  if (!sub || sub.endsWith("/")) sub += "index.html";
  if (sub.includes("..") || sub.includes("\0")) {
    return new Response("Not Found", { status: 404 });
  }

  let filePath = safeJoinStaffStatic(root, sub);
  let data: Uint8Array | null = null;
  if (filePath) {
    try {
      data = await Deno.readFile(filePath);
    } catch {
      data = null;
    }
  }
  if (!data) {
    // SPA fallback to plugin index.html
    filePath = safeJoinStaffStatic(root, "index.html");
    if (!filePath) return new Response("Not Found", { status: 404 });
    try {
      data = await Deno.readFile(filePath);
    } catch {
      return new Response("Not Found", { status: 404 });
    }
  }

  const headers = headersFor(filePath);
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(new Uint8Array(data), {
    status: 200,
    headers,
  });
}

export async function adminStaticHandler(
  req: Request,
  _userId: string | null,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);

  // Plugin static before host SPA (so /admin/mytool is not SPA-fallback)
  const pluginRes = await serveStaffPluginStatic(
    url.pathname,
    req.method,
  );
  if (pluginRes) return pluginRes;

  const rel = spaRelPath(url.pathname);
  if (rel === null) {
    return new Response(
      JSON.stringify({ error: "Invalid path" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  const asset = await loadAsset(rel);
  if (!asset) {
    return new Response("Not Found", { status: 404 });
  }

  const headers = headersFor(asset.name);
  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  // Copy into a fresh buffer — Response BodyInit typing
  const body = new Uint8Array(asset.data);
  return new Response(body, { status: 200, headers });
}
