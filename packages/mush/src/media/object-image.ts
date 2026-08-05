/**
 * Local object images (rooms, things, players).
 *
 * Layout:  data/images/{id}.{ext}
 * Public:  /images/{id}.{ext}
 *
 * Same flow as @avatar: fetch URL or accept uploaded bytes,
 * validate MIME/size, store on disk, set data.image.
 */

import { ensureDir } from "@std/fs";
import { join } from "@std/path";
import {
  fetchAndValidate,
  MIME_TO_EXT,
} from "../verbs/avatar-fetch.ts";
import type { IUrsamuSDK } from "../commands/types.ts";

export const IMAGES_DIR = "data/images";
export const IMAGES_PUBLIC = "/images";
/** Room banners are often large; 8 MB still SSRF/DoS-safe. */
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const EXT_RE = /^(png|jpe?g|gif|webp)$/i;

const MAGIC: Array<{ ext: string; test: (b: Uint8Array) => boolean }> = [
  {
    ext: "png",
    test: (b) =>
      b.length >= 8 &&
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    ext: "jpg",
    test: (b) =>
      b.length >= 3 &&
      b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    ext: "gif",
    test: (b) =>
      b.length >= 6 &&
      b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46,
  },
  {
    ext: "webp",
    test: (b) =>
      b.length >= 12 &&
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 &&
      b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 &&
      b[11] === 0x50,
  },
];

export function bareObjId(id: string | number): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

export function publicImageUrl(
  id: string | number,
  ext: string,
): string {
  const bare = bareObjId(id);
  const e = String(ext).toLowerCase().replace(/^\./, "");
  return `${IMAGES_PUBLIC}/${bare}.${e}`;
}

/** Strip ?query for path checks (cache-bust params allowed). */
export function imageUrlPath(raw: string): string {
  return String(raw ?? "").trim().split("?")[0] ?? "";
}

/** Safe for look /play media — local paths or http(s). */
export function isPlayableImageUrl(raw: string): boolean {
  const s = imageUrlPath(raw);
  if (!s) return false;
  if (/^https?:\/\//i.test(String(raw ?? "").trim())) return true;
  if (s.startsWith(`${IMAGES_PUBLIC}/`)) return true;
  if (s.startsWith("/avatars/")) return true;
  if (s.startsWith("/site/")) return true;
  return false;
}

export async function removeObjectImage(
  id: string | number,
): Promise<void> {
  const bare = bareObjId(id);
  if (!bare || !/^[a-zA-Z0-9_-]+$/.test(bare)) return;
  try {
    for await (const entry of Deno.readDir(IMAGES_DIR)) {
      if (!entry.isFile) continue;
      if (entry.name.startsWith(bare + ".")) {
        await Deno.remove(join(IMAGES_DIR, entry.name));
      }
    }
  } catch {
    /* no dir yet */
  }
}

/**
 * Validate bytes (magic + size). mimeHint is optional Content-Type.
 */
export function validateImageBytes(
  bytes: Uint8Array,
  mimeHint?: string,
): { ok: true; ext: string } | { ok: false; error: string } {
  if (bytes.length === 0) {
    return { ok: false, error: "Empty image." };
  }
  if (bytes.length > MAX_IMAGE_BYTES) {
    return {
      ok: false,
      error: "Image must be 8 MB or smaller.",
    };
  }
  for (const m of MAGIC) {
    if (m.test(bytes)) return { ok: true, ext: m.ext };
  }
  const mime = (mimeHint || "").split(";")[0].trim().toLowerCase();
  const fromMime = MIME_TO_EXT[mime];
  if (fromMime) return { ok: true, ext: fromMime };
  return {
    ok: false,
    error: "Image must be PNG, JPEG, GIF, or WebP.",
  };
}

export async function writeObjectImage(
  id: string | number,
  bytes: Uint8Array,
  ext: string,
): Promise<string> {
  const bare = bareObjId(id);
  if (!bare || !/^[a-zA-Z0-9_-]+$/.test(bare)) {
    throw new Error("Invalid object id");
  }
  const e = String(ext).toLowerCase().replace(/^\./, "");
  if (!EXT_RE.test(e)) throw new Error("Invalid image ext");
  await ensureDir(IMAGES_DIR);
  await removeObjectImage(bare);
  const name = `${bare}.${e === "jpeg" ? "jpg" : e}`;
  const path = join(IMAGES_DIR, name);
  await Deno.writeFile(path, bytes);
  // Cache-bust so replace always shows the new file (same path).
  const rev = Date.now().toString(36);
  return `${IMAGES_PUBLIC}/${name}?v=${rev}`;
}

/**
 * Apply stored image fields on a data bag (mutates).
 * URL should already include ?v= cache-bust from writeObjectImage.
 */
export function setImageDataFields(
  data: Record<string, unknown>,
  url: string,
  ext: string,
): void {
  data.image = url;
  data.imageExt = ext.toLowerCase().replace(/^\./, "");
  // Keep avatarExt in sync for players (staff chrome /api/v1/me)
  data.avatarExt = data.imageExt;
  const q = String(url).match(/[?&]v=([^&]+)/);
  if (q?.[1]) data.imageRev = q[1];
  else data.imageRev = Date.now().toString(36);
}

export function clearImageDataFields(
  data: Record<string, unknown>,
): void {
  delete data.image;
  delete data.imageExt;
  delete data.image_url;
  delete data.avatarExt;
}

/**
 * Resolve display URL from data or disk.
 */
export async function resolveObjectImageUrl(
  id: string | number,
  data?: Record<string, unknown> | null,
): Promise<string | null> {
  const bare = bareObjId(id);
  if (!bare) return null;

  // Prefer stored URL (includes ?v= bust after replace)
  const img = data?.image;
  if (typeof img === "string") {
    const s = img.trim();
    if (isPlayableImageUrl(s)) return s;
  }

  const rev = data?.imageRev != null
    ? String(data.imageRev)
    : "";
  const bust = rev ? `?v=${encodeURIComponent(rev)}` : "";

  const ext = data?.imageExt ?? data?.avatarExt;
  if (typeof ext === "string" && EXT_RE.test(ext)) {
    const e = ext.toLowerCase() === "jpeg" ? "jpg" : ext.toLowerCase();
    return `${IMAGES_PUBLIC}/${bare}.${e}${bust}`;
  }

  // Disk scan: data/images then legacy data/avatars
  for (const dir of [IMAGES_DIR, "data/avatars"]) {
    const prefix = dir === IMAGES_DIR ? IMAGES_PUBLIC : "/avatars";
    try {
      for await (const entry of Deno.readDir(dir)) {
        if (!entry.isFile) continue;
        if (!entry.name.startsWith(bare + ".")) continue;
        // mtime bust when DB has no rev
        let v = bust;
        if (!v) {
          try {
            const st = await Deno.stat(join(dir, entry.name));
            if (st.mtime) {
              v = `?v=${st.mtime.getTime().toString(36)}`;
            }
          } catch {
            /* ignore */
          }
        }
        return `${prefix}/${entry.name}${v}`;
      }
    } catch {
      /* missing dir */
    }
  }
  return null;
}

/** Fetch remote URL via shared SSRF-safe helper, then store. */
export async function importImageFromUrl(
  id: string | number,
  urlStr: string,
  u?: Pick<IUrsamuSDK, "send">,
): Promise<
  | { ok: true; url: string; ext: string }
  | { ok: false; error: string }
> {
  let url: URL;
  try {
    url = new URL(urlStr.trim());
  } catch {
    return { ok: false, error: "Invalid URL." };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: "URL must use http or https." };
  }

  const sink = u ?? {
    send: (_m: string) => {
      /* rest path collects error via return */
    },
  };
  // fetchAndValidate sends on u; capture last message
  let last = "";
  const messenger = {
    send: (m: string) => {
      last = m;
      if (u) u.send(m);
    },
  } as IUrsamuSDK;

  const result = await fetchAndValidate(url, messenger);
  if (!result) {
    return {
      ok: false,
      error: last || "Could not fetch that URL.",
    };
  }

  const urlOut = await writeObjectImage(id, result.bytes, result.ext);
  return { ok: true, url: urlOut, ext: result.ext };
}

/** Store uploaded bytes. */
export async function importImageFromBytes(
  id: string | number,
  bytes: Uint8Array,
  mimeHint?: string,
): Promise<
  | { ok: true; url: string; ext: string }
  | { ok: false; error: string }
> {
  const v = validateImageBytes(bytes, mimeHint);
  if (!v.ok) return v;
  const url = await writeObjectImage(id, bytes, v.ext);
  return { ok: true, url, ext: v.ext };
}

/**
 * Public file server for /images/:id[.ext]
 */
export async function objectImageServe(
  urlPath: string,
): Promise<Response> {
  const raw = urlPath.slice(IMAGES_PUBLIC.length + 1).split("?")[0];
  if (
    !raw ||
    !/^[a-zA-Z0-9_-]+(\.(png|jpe?g|gif|webp))?$/i.test(raw)
  ) {
    return new Response("Not Found", { status: 404 });
  }
  const wantExact = raw.includes(".");
  const id = wantExact ? raw.replace(/\.[^.]+$/, "") : raw;
  const mime: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  try {
    for await (const entry of Deno.readDir(IMAGES_DIR)) {
      const hit = wantExact
        ? entry.name.toLowerCase() === raw.toLowerCase()
        : entry.name.startsWith(id + ".");
      if (!hit || !entry.isFile) continue;
      const ext = (entry.name.split(".").pop() ?? "").toLowerCase();
      const full = join(IMAGES_DIR, entry.name);
      const file = await Deno.readFile(full);
      let etag = "";
      try {
        const st = await Deno.stat(full);
        etag = `"${st.size}-${st.mtime?.getTime() ?? 0}"`;
      } catch {
        etag = `"${file.byteLength}"`;
      }
      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": mime[ext] ?? "application/octet-stream",
          // Short cache; clients also use ?v= bust on replace
          "Cache-Control": "public, max-age=60, must-revalidate",
          "ETag": etag,
        },
      });
    }
  } catch {
    /* no dir */
  }
  return new Response("Not Found", { status: 404 });
}
