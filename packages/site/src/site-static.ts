/**
 * Plugin static trees under /site/p/<id>/…
 */

import { fromFileUrl, join, normalize } from "@std/path";

export type SiteStaticRegistration = {
  /** URL segment: /site/p/<id>/ */
  id: string;
  /**
   * Directory root — absolute path, file URL, or URL from
   * `new URL("./public/", import.meta.url)`.
   */
  root: string | URL;
};

const RESERVED = new Set([
  "css",
  "js",
  "skins",
  "theme",
  "wiki",
  "fonts",
  "config",
  "p",
  "api",
  "login",
  "profile",
]);

const _static = new Map<string, string>();

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function resolveRoot(root: string | URL): string | null {
  try {
    if (root instanceof URL) {
      if (root.protocol === "file:") return fromFileUrl(root);
      return null;
    }
    const s = String(root).trim();
    if (!s) return null;
    if (s.startsWith("file:")) return fromFileUrl(s);
    return normalize(s);
  } catch {
    return null;
  }
}

/** True when id is safe for /site/p/<id>/. */
export function isSiteStaticId(id: string): boolean {
  const k = id.trim().toLowerCase();
  if (!k || !/^[a-z][a-z0-9_-]*$/i.test(k)) return false;
  if (RESERVED.has(k)) return false;
  return true;
}

/**
 * Register plugin files at /site/p/<id>/…
 * Returns false if id invalid or root unreadable.
 */
export function registerSiteStatic(
  reg: SiteStaticRegistration,
): boolean {
  if (!isNonEmpty(reg.id) || !isSiteStaticId(reg.id)) return false;
  const abs = resolveRoot(reg.root);
  if (!abs) return false;
  const id = reg.id.trim().toLowerCase();
  _static.set(id, abs);
  return true;
}

export function unregisterSiteStatic(id: string): void {
  if (!isNonEmpty(id)) return;
  _static.delete(id.trim().toLowerCase());
}

export function listSiteStatic(): string[] {
  return [..._static.keys()].sort();
}

export function getSiteStaticRoot(id: string): string | null {
  return _static.get(id.trim().toLowerCase()) ?? null;
}

export function clearSiteStatic(): void {
  _static.clear();
}

/** Join under plugin root; null on traversal. */
export function safeJoinSiteStatic(
  root: string,
  rel: string,
): string | null {
  const cleaned = rel.replace(/^\/+/, "").replace(/\\/g, "/");
  if (cleaned.includes("\0") || cleaned.split("/").includes("..")) {
    return null;
  }
  const full = normalize(join(root, cleaned));
  const rootNorm = normalize(root);
  const prefix = rootNorm.endsWith("/") ? rootNorm : `${rootNorm}/`;
  if (full !== rootNorm && !full.startsWith(prefix)) return null;
  return full;
}
