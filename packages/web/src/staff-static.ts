/**
 * Plugin static trees served under /admin/<id>/…
 * Checked inside adminStaticHandler before the host SPA.
 */

import { fromFileUrl, join, normalize } from "@std/path";

export type StaffStaticRegistration = {
  id: string;
  root: string | URL;
};

/** Host SPA segments — plugins may not claim these ids. */
const RESERVED = new Set([
  "assets",
  "wiki",
  "db",
  "players",
  "jobs",
  "bbs",
  "bbs-app",
  "settings",
  "map",
  "login",
  "forbidden",
  "ext",
  "ws",
  "api",
  "staff-theme.css",
  "favicon.svg",
  "icons.svg",
  "index.html",
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

export function isStaffStaticId(id: string): boolean {
  const k = id.trim().toLowerCase();
  if (!k || !/^[a-z][a-z0-9_-]*$/i.test(k)) return false;
  if (RESERVED.has(k)) return false;
  return true;
}

export function registerStaffStatic(
  reg: StaffStaticRegistration,
): boolean {
  if (!isNonEmpty(reg.id) || !isStaffStaticId(reg.id)) return false;
  const abs = resolveRoot(reg.root);
  if (!abs) return false;
  _static.set(reg.id.trim().toLowerCase(), abs);
  return true;
}

export function unregisterStaffStatic(id: string): void {
  if (!isNonEmpty(id)) return;
  _static.delete(id.trim().toLowerCase());
}

export function listStaffStatic(): string[] {
  return [..._static.keys()].sort();
}

export function getStaffStaticRoot(id: string): string | null {
  return _static.get(id.trim().toLowerCase()) ?? null;
}

export function clearStaffStatic(): void {
  _static.clear();
}

export function safeJoinStaffStatic(
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
