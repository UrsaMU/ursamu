/**
 * Serve the **fallback** BBS staff SPA under /admin/bbs-app/ only.
 *
 * Prefer @ursamu/web in-console /admin/bbs (AppLayout). This handler
 * is registered only when web is absent. Never maps /admin/bbs —
 * that path belongs to the host console SPA.
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
};

/** Relative SPA path under /admin/bbs-app/ only. */
export function spaRelPath(pathname: string): string | null {
  // Host console owns /admin/bbs — never this SPA.
  if (
    pathname !== "/admin/bbs-app" &&
    !pathname.startsWith("/admin/bbs-app/")
  ) {
    return null;
  }
  let rel = pathname.replace(/^\/admin\/bbs-app\/?/, "");
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
  if (!rel.includes(".")) rel = "index.html";

  const parts = rel.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === ".")) return null;
  return parts.join("/");
}

/** Map /admin/bbs-app URL path → file under SPA root. */
export function resolveBbsAdminFile(
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

export async function bbsAdminStaticHandler(
  req: Request,
  _userId: string | null,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
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
    return new Response(
      "BBS admin UI not built. Run: deno task ui:build",
      { status: 404 },
    );
  }

  const headers = headersFor(asset.name);
  if (req.method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(
    asset.data as unknown as BodyInit,
    { status: 200, headers },
  );
}
