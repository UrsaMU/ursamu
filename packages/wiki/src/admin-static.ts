/**
 * Serve the wiki admin SPA under /admin/wiki/.
 *
 * Files live in packages/wiki/admin/. Path traversal is rejected.
 * Auth is enforced in the browser (login + staff flags); this handler
 * only delivers static assets.
 */

import {
  join,
  normalize,
  fromFileUrl,
  relative,
  isAbsolute,
} from "@std/path";

const ADMIN_ROOT = fromFileUrl(
  new URL("../admin/", import.meta.url),
);

/** True if `target` is inside `base` (or equal). */
function isInside(base: string, target: string): boolean {
  const rel = relative(base, target);
  return rel === "" || (!rel.startsWith("..") && !isAbsolute(rel));
}

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".json": "application/json",
  ".map": "application/json",
  ".woff2": "font/woff2",
};

/**
 * Map a request URL path under /admin/wiki to a file under admin/.
 * Returns null if the path escapes the admin root.
 */
export function resolveAdminFile(pathname: string): string | null {
  let rel = pathname.replace(/^\/admin\/wiki\/?/, "");
  try {
    rel = decodeURIComponent(rel);
  } catch {
    return null;
  }
  // Normalize slashes; reject null bytes and absolute segments.
  rel = rel.replace(/\\/g, "/");
  if (rel.includes("\0") || rel.startsWith("/") || /^[a-zA-Z]:/.test(rel)) {
    return null;
  }
  if (!rel || rel.endsWith("/")) rel += "index.html";
  // SPA fallback: bare routes without extension → index.html
  if (!rel.includes(".")) rel = "index.html";

  // Reject .. segments before join.
  const parts = rel.split("/").filter((p) => p.length > 0);
  if (parts.some((p) => p === ".." || p === ".")) return null;

  const base = normalize(ADMIN_ROOT);
  const target = normalize(join(ADMIN_ROOT, ...parts));
  if (!isInside(base, target)) return null;
  return target;
}

function mimeFor(filePath: string): string {
  const dot = filePath.lastIndexOf(".");
  const ext = dot === -1 ? "" : filePath.slice(dot).toLowerCase();
  return MIME[ext] ?? "application/octet-stream";
}

/**
 * Plugin route handler for GET /admin/wiki and static assets.
 */
export async function adminStaticHandler(
  req: Request,
  _userId: string | null,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const filePath = resolveAdminFile(url.pathname);
  if (!filePath) {
    return new Response(JSON.stringify({ error: "Invalid path" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const data = await Deno.readFile(filePath);
    const headers = new Headers({
      "Content-Type": mimeFor(filePath),
      // Staff tool: always revalidate so dashboard/JS edits show up.
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    return new Response(data, { status: 200, headers });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      try {
        const index = join(ADMIN_ROOT, "index.html");
        const data = await Deno.readFile(index);
        return new Response(data, {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-cache",
            "X-Content-Type-Options": "nosniff",
          },
        });
      } catch {
        return new Response("Not Found", { status: 404 });
      }
    }
    throw e;
  }
}
