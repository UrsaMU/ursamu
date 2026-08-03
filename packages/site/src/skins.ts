/**
 * Builtin skin discovery for staff settings UI.
 */

import { fromFileUrl } from "@std/path";

const SKINS_BASE = new URL(
  "../public/css/skins/",
  import.meta.url,
);

const FALLBACK = ["default", "changeling", "court"] as const;

/**
 * Named skins shipped under public/css/skins/*.css
 * (excludes custom.example and non-.css files).
 * When loaded from JSR (https), directory listing is unavailable —
 * return the known shipped set.
 */
export async function listBuiltinSkins(): Promise<string[]> {
  if (SKINS_BASE.protocol !== "file:") {
    return [...FALLBACK];
  }
  try {
    const dir = fromFileUrl(SKINS_BASE);
    const names: string[] = [];
    for await (const e of Deno.readDir(dir)) {
      if (!e.isFile || !e.name.endsWith(".css")) continue;
      const base = e.name.slice(0, -".css".length);
      if (!base || base.startsWith("custom.")) continue;
      if (!/^[a-z][a-z0-9_-]*$/i.test(base)) continue;
      names.push(base.toLowerCase());
    }
    names.sort();
    return names.length ? names : [...FALLBACK];
  } catch {
    return [...FALLBACK];
  }
}

/** Absolute path to skins dir (tests / path checkouts only). */
export function builtinSkinsDir(): string {
  if (SKINS_BASE.protocol === "file:") {
    return fromFileUrl(SKINS_BASE);
  }
  // JSR: no real disk path; callers should treat as opaque.
  return SKINS_BASE.href;
}

export function skinCssHref(name: string): string {
  const n = name.trim().toLowerCase() || "default";
  return `/site/css/skins/${n}.css`;
}
