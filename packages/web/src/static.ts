/**
 * Serve the staff web console under /admin/ (and legacy /admin/wiki/).
 *
 * Prefer packages/web/dist/ (Vue build). Fall back to admin/ if
 * dist is missing (dev before first build).
 */

import {
  join,
  normalize,
  fromFileUrl,
  relative,
  isAbsolute,
} from "@std/path";

const DIST_ROOT = fromFileUrl(
  new URL("../dist/", import.meta.url),
);
const LEGACY_ROOT = fromFileUrl(
  new URL("../admin/", import.meta.url),
);

async function resolveRoot(): Promise<string> {
  try {
    const st = await Deno.stat(join(DIST_ROOT, "index.html"));
    if (st.isFile) return normalize(DIST_ROOT);
  } catch {
    /* fall through */
  }
  return normalize(LEGACY_ROOT);
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
 * Map /admin or /admin/wiki URL path to a file under the SPA root.
 */
export function resolveAdminFile(
  pathname: string,
  root: string,
): string | null {
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

  const base = normalize(root);
  const target = normalize(join(root, ...parts));
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

export async function adminStaticHandler(
  req: Request,
  _userId: string | null,
): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const root = await resolveRoot();
  const url = new URL(req.url);
  let filePath = resolveAdminFile(url.pathname, root);
  if (!filePath) {
    return new Response(
      JSON.stringify({ error: "Invalid path" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  try {
    const data = await Deno.readFile(filePath);
    const headers = new Headers({
      "Content-Type": mimeFor(filePath),
      "Cache-Control": filePath.endsWith(".html")
        ? "no-cache"
        : "no-cache",
      "X-Content-Type-Options": "nosniff",
    });
    if (req.method === "HEAD") {
      return new Response(null, { status: 200, headers });
    }
    return new Response(data, { status: 200, headers });
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      // Vue history fallback
      try {
        const index = join(root, "index.html");
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
