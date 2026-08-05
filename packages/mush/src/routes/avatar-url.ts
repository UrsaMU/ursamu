/**
 * Resolve public avatar URL for a player.
 *
 * Files may live under data/avatars/ (legacy @avatar) and/or
 * data/images/ (shared object-image store). Prefer a path that
 * actually exists on disk so nav never 404s.
 */

import { join } from "@std/path";
import { isPlayableImageUrl } from "../media/object-image.ts";

const AVATARS_DIR = "data/avatars";
const IMAGES_DIR = "data/images";
const EXT_RE = /^(png|jpe?g|gif|webp)$/i;

/** Strip leading # from dbref-style ids. */
export function barePlayerId(id: string | number): string {
  return String(id ?? "").replace(/^#/, "").trim();
}

function normExt(ext: string): string {
  const e = ext.toLowerCase().replace(/^\./, "");
  return e === "jpeg" ? "jpg" : e;
}

function bustFromData(
  data?: Record<string, unknown> | null,
): string {
  const rev = data?.imageRev != null
    ? String(data.imageRev)
    : "";
  return rev ? `?v=${encodeURIComponent(rev)}` : "";
}

async function fileExists(path: string): Promise<boolean> {
  try {
    const st = await Deno.stat(path);
    return st.isFile;
  } catch {
    return false;
  }
}

/** First existing file for id under dir → public URL. */
async function scanDir(
  dir: string,
  prefix: string,
  bare: string,
  bust: string,
): Promise<string | null> {
  try {
    for await (const entry of Deno.readDir(dir)) {
      if (!entry.isFile) continue;
      if (!entry.name.startsWith(bare + ".")) continue;
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
  return null;
}

/**
 * Synchronous path when image / avatarExt is known.
 * Prefer /avatars/ in the URL when only ext is known — disk
 * check happens in resolveAvatarUrl.
 */
export function avatarUrlFromData(
  playerId: string | number,
  data?: Record<string, unknown> | null,
): string | null {
  const bare = barePlayerId(playerId);
  if (!bare) return null;

  const img = data?.image;
  if (typeof img === "string") {
    const s = img.trim();
    if (!s) return null;
    if (isPlayableImageUrl(s)) return s;
    if (/^[a-zA-Z0-9_-]+\.(png|jpe?g|gif|webp)$/i.test(s)) {
      // Bare filename — prefer legacy avatars path
      return `/avatars/${s}`;
    }
  }

  const ext = data?.imageExt ?? data?.avatarExt;
  if (typeof ext === "string" && EXT_RE.test(ext)) {
    const e = normExt(ext);
    const bust = bustFromData(data);
    // Historical @avatar files are under /avatars/
    return `/avatars/${bare}.${e}${bust}`;
  }
  return null;
}

/**
 * Resolve a working avatar URL: verify local files exist.
 */
export async function resolveAvatarUrl(
  playerId: string | number,
  data?: Record<string, unknown> | null,
): Promise<string | null> {
  const bare = barePlayerId(playerId);
  if (!bare) return null;
  const bust = bustFromData(data);

  // 1. Explicit data.image — keep if remote or file exists
  const img = typeof data?.image === "string"
    ? data.image.trim()
    : "";
  if (img) {
    if (/^https?:\/\//i.test(img)) return img;
    const pathOnly = img.split("?")[0] ?? img;
    if (pathOnly.startsWith("/site/")) return img;
    if (pathOnly.startsWith("/avatars/")) {
      const name = pathOnly.slice("/avatars/".length);
      if (await fileExists(join(AVATARS_DIR, name))) return img;
    }
    if (pathOnly.startsWith("/images/")) {
      const name = pathOnly.slice("/images/".length);
      if (await fileExists(join(IMAGES_DIR, name))) return img;
    }
  }

  // 2. Known extension — prefer whichever dir has the file
  const extRaw = data?.imageExt ?? data?.avatarExt;
  if (typeof extRaw === "string" && EXT_RE.test(extRaw)) {
    const e = normExt(extRaw);
    const name = `${bare}.${e}`;
    if (await fileExists(join(AVATARS_DIR, name))) {
      return `/avatars/${name}${bust}`;
    }
    if (await fileExists(join(IMAGES_DIR, name))) {
      return `/images/${name}${bust}`;
    }
  }

  // 3. Disk scan — avatars first (player portraits), then images
  const fromAvatars = await scanDir(
    AVATARS_DIR,
    "/avatars",
    bare,
    bust,
  );
  if (fromAvatars) return fromAvatars;

  const fromImages = await scanDir(
    IMAGES_DIR,
    "/images",
    bare,
    bust,
  );
  if (fromImages) return fromImages;

  return null;
}
