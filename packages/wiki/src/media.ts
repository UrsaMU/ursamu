/**
 * Per-page on-server wiki images.
 *
 * Layout: wiki/<pagePath>/_assets/<name.ext>
 * Public URL: /api/v1/wiki/<pagePath>/_assets/<name.ext>
 *
 * Staff can upload bytes or import from a remote URL (SSRF-guarded).
 */

import { join, resolve } from "@std/path";
import { ensureDir } from "@std/fs";
import {
  WIKI_DIR,
  MAX_UPLOAD_BYTES,
  ALLOWED_MEDIA_TYPES,
  safePath,
  mimeForPath,
  normalisePath,
  findPageFile,
} from "./fs.ts";
import {
  isPrivateIp,
  chooseFetchTarget,
} from "./url-safety.ts";
import {
  downsampleIfNeeded,
  TARGET_SAVE_BYTES,
} from "./downsample.ts";

export const ASSETS_DIR = "_assets";
export { TARGET_SAVE_BYTES };

/** Raster + web-friendly types for article images. */
export const IMAGE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".svg",
]);

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/gif": ".gif",
  "image/webp": ".webp",
  "image/svg+xml": ".svg",
};

export type MediaItem = {
  name: string;
  path: string;
  url: string;
  size: number;
  type: string;
};

export function assetsRelDir(pagePath: string): string {
  return `${normalisePath(pagePath)}/${ASSETS_DIR}`;
}

export function assetRelPath(
  pagePath: string,
  name: string,
): string {
  return `${assetsRelDir(pagePath)}/${name}`;
}

export function publicAssetUrl(
  pagePath: string,
  name: string,
): string {
  return `/api/v1/wiki/${assetRelPath(pagePath, name)}`;
}

/**
 * Short markdown form authors write (resolved at render):
 *   ![crest](crest.png)
 * Full URL still works for external images.
 */
export function shortImageMarkdown(
  name: string,
  alt?: string,
): string {
  const safe = safeAssetName(name);
  const file = safe ?? String(name).replace(/^.*[/\\]/, "");
  const a = (alt ?? file.replace(/\.[^.]+$/, "")).trim() ||
    file;
  return `![${a}](${file})`;
}

/**
 * Resolve markdown image src for a page.
 * - absolute http(s) or /path → unchanged
 * - crest.png / _assets/crest.png / ./crest.png → API URL
 */
export function resolveImageSrc(
  src: string,
  pagePath: string,
): string | null {
  const raw = String(src ?? "").trim();
  if (!raw) return null;
  if (/^\s*javascript:/i.test(raw) || /^\s*data:/i.test(raw)) {
    return null;
  }
  // Absolute URL or site-root path
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/")) {
    return raw;
  }
  let ref = raw.replace(/^\.\//, "");
  if (ref.startsWith(`${ASSETS_DIR}/`)) {
    ref = ref.slice(ASSETS_DIR.length + 1);
  }
  const name = safeAssetName(ref);
  if (!name) return null;
  const page = normalisePath(pagePath);
  if (!page) return null;
  return publicAssetUrl(page, name);
}

/**
 * Safe asset filename: lowercase, no path segments, allowed ext.
 * Spaces → hyphens. Rejects path separators and `..`.
 */
export function safeAssetName(raw: string): string | null {
  let s = String(raw ?? "").trim();
  if (!s || s.length > 160) return null;
  if (s.includes("..") || s.includes("\0")) return null;
  // Basename only if a path slipped in
  s = s.replace(/^.*[/\\]/, "");
  s = s.toLowerCase().replace(/\s+/g, "-");
  s = s.replace(/[^a-z0-9._-]+/g, "");
  s = s.replace(/-+/g, "-").replace(/^\.+/, "");
  if (!s || s.length > 120) return null;
  if (!/^[a-z0-9][a-z0-9._-]*\.[a-z0-9]+$/.test(s)) {
    return null;
  }
  const mime = mimeForPath(s);
  if (!mime) return null;
  const ext = s.slice(s.lastIndexOf("."));
  if (!IMAGE_EXTS.has(ext)) return null;
  return s;
}

export function extFromContentType(ct: string): string | null {
  const base = ct.split(";")[0]?.trim().toLowerCase() ?? "";
  return MIME_TO_EXT[base] ?? null;
}

export function nameFromUrl(
  url: string,
  contentType: string,
): string | null {
  try {
    const u = new URL(url);
    const last = decodeURIComponent(
      u.pathname.split("/").filter(Boolean).pop() ?? "",
    );
    // basename only — drop any residual path junk
    const leaf = last.replace(/^.*[/\\]/, "");
    const cleaned = safeAssetName(leaf);
    if (cleaned) return cleaned;
  } catch {
    /* fall through */
  }
  const ext = extFromContentType(contentType) ?? ".png";
  return safeAssetName(`image-${Date.now()}${ext}`);
}

/** Ensure the wiki page exists before attaching media. */
export async function pageExists(
  pagePath: string,
): Promise<boolean> {
  return (await findPageFile(normalisePath(pagePath))) != null;
}

export async function listPageMedia(
  pagePath: string,
): Promise<MediaItem[]> {
  const rel = assetsRelDir(pagePath);
  const abs = safePath(rel);
  if (!abs) return [];
  const out: MediaItem[] = [];
  try {
    for await (const e of Deno.readDir(abs)) {
      if (!e.isFile) continue;
      const name = safeAssetName(e.name);
      if (!name) continue;
      const full = join(abs, name);
      let size = 0;
      try {
        size = (await Deno.stat(full)).size;
      } catch {
        continue;
      }
      const type = mimeForPath(name) ?? "application/octet-stream";
      out.push({
        name,
        path: assetRelPath(pagePath, name),
        url: publicAssetUrl(pagePath, name),
        size,
        type,
      });
    }
  } catch {
    return [];
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/** Raster types we can downsample (not SVG). */
const DOWNSAMPLE_EXTS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
]);

export async function savePageMedia(
  pagePath: string,
  name: string,
  data: Uint8Array,
): Promise<MediaItem | { error: string; status: number }> {
  let safe = safeAssetName(name);
  if (!safe) {
    return {
      error:
        "Invalid name. Use a-z, 0-9, ._- and an image " +
        "extension (.png .jpg .gif .webp .svg).",
      status: 400,
    };
  }
  if (!data.length) {
    return { error: "Empty file", status: 400 };
  }
  if (data.length > MAX_UPLOAD_BYTES) {
    return {
      error:
        "File too large (max 8 MB; over 2 MB is " +
        "downsampled on save)",
      status: 413,
    };
  }
  if (!(await pageExists(pagePath))) {
    return { error: "Page not found", status: 404 };
  }

  let bytes = data;
  const dot = safe.lastIndexOf(".");
  const ext = dot >= 0 ? safe.slice(dot).toLowerCase() : "";
  if (DOWNSAMPLE_EXTS.has(ext) && bytes.length > TARGET_SAVE_BYTES) {
    const prepared = await downsampleIfNeeded(
      bytes,
      ext.slice(1),
    );
    if (!prepared.ok) {
      return { error: prepared.error, status: 413 };
    }
    bytes = prepared.bytes;
    const newExt = `.${prepared.ext}`;
    if (newExt !== ext) {
      const base = safe.slice(0, dot);
      const renamed = safeAssetName(`${base}${newExt}`);
      if (!renamed) {
        return {
          error: "Could not rename downsampled image",
          status: 500,
        };
      }
      safe = renamed;
    }
  }

  const rel = assetRelPath(pagePath, safe);
  const abs = safePath(rel);
  if (!abs) return { error: "Invalid path", status: 400 };
  await ensureDir(resolve(join(abs, "..")));
  await Deno.writeFile(abs, bytes);
  const type = mimeForPath(safe) ?? "application/octet-stream";
  return {
    name: safe,
    path: rel,
    url: publicAssetUrl(pagePath, safe),
    size: bytes.length,
    type,
  };
}

export async function deletePageMedia(
  pagePath: string,
  name: string,
): Promise<{ ok: true } | { error: string; status: number }> {
  const safe = safeAssetName(name);
  if (!safe) return { error: "Invalid name", status: 400 };
  const abs = safePath(assetRelPath(pagePath, safe));
  if (!abs) return { error: "Invalid path", status: 400 };
  try {
    await Deno.remove(abs);
    return { ok: true };
  } catch {
    return { error: "Not found", status: 404 };
  }
}

/**
 * Download a remote image into the page _assets folder.
 * Reuses SSRF guards (DNS + private IP block).
 */
export async function importRemoteMedia(
  pagePath: string,
  fetchUrl: string,
  preferredName?: string,
): Promise<MediaItem | { error: string; status: number }> {
  if (
    !fetchUrl.startsWith("http://") &&
    !fetchUrl.startsWith("https://")
  ) {
    return {
      error: "URL must start with http:// or https://",
      status: 400,
    };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(fetchUrl);
  } catch {
    return { error: "Invalid URL", status: 400 };
  }

  const hostname = parsedUrl.hostname
    .toLowerCase()
    .replace(/^\[|\]$/g, "");
  if (hostname === "localhost") {
    return {
      error: "URL resolves to a private address",
      status: 400,
    };
  }

  const addrs = [
    ...await Deno.resolveDns(hostname, "A").catch(() => []),
    ...await Deno.resolveDns(hostname, "AAAA").catch(() => []),
  ];
  if (!addrs.length || addrs.some(isPrivateIp)) {
    return {
      error: "URL resolves to a private or internal address",
      status: 400,
    };
  }

  const { fetchUrl: targetUrl, hostHeader } = chooseFetchTarget(
    parsedUrl,
    addrs,
  );
  const headers: Record<string, string> = {};
  if (hostHeader) headers["Host"] = hostHeader;

  let resp: Response;
  try {
    resp = await fetch(targetUrl, {
      headers,
      signal: AbortSignal.timeout(15_000),
      redirect: "follow",
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: `Fetch error: ${msg}`, status: 502 };
  }
  if (!resp.ok) {
    return {
      error: `Fetch failed: ${resp.status} ${resp.statusText}`,
      status: 502,
    };
  }

  const contentType = resp.headers.get("content-type") || "";
  const allowed = Object.values(ALLOWED_MEDIA_TYPES);
  if (!allowed.some((m) => contentType.startsWith(m))) {
    return {
      error: `Unsupported content type: ${contentType}`,
      status: 415,
    };
  }

  const data = new Uint8Array(await resp.arrayBuffer());
  if (data.length > MAX_UPLOAD_BYTES) {
    return {
      error:
        "File too large (max 8 MB; over 2 MB is " +
        "downsampled on save)",
      status: 413,
    };
  }

  let name = preferredName
    ? safeAssetName(preferredName)
    : null;
  if (!name) name = nameFromUrl(fetchUrl, contentType);
  if (!name) {
    return { error: "Could not derive a safe filename", status: 400 };
  }

  return await savePageMedia(pagePath, name, data);
}

/** Absolute path of the page assets directory (for tests). */
export function assetsAbsDir(pagePath: string): string | null {
  return safePath(assetsRelDir(pagePath));
}

export { WIKI_DIR, MAX_UPLOAD_BYTES };
