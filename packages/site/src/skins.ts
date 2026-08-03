/**
 * Builtin skin discovery for staff settings UI.
 */

import { fromFileUrl, join } from "@std/path";

const SKINS_DIR = fromFileUrl(
  new URL("../public/css/skins/", import.meta.url),
);

const FALLBACK = ["default", "changeling", "court"] as const;

/**
 * Named skins shipped under public/css/skins/*.css
 * (excludes custom.example and non-.css files).
 */
export async function listBuiltinSkins(): Promise<string[]> {
  try {
    const names: string[] = [];
    for await (const e of Deno.readDir(SKINS_DIR)) {
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

/** Absolute path to skins dir (tests / tooling). */
export function builtinSkinsDir(): string {
  return SKINS_DIR;
}

export function skinCssHref(name: string): string {
  const n = name.trim().toLowerCase() || "default";
  return `/site/css/skins/${n}.css`;
}
