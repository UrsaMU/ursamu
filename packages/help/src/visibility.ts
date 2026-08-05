/**
 * Staff-only help visibility.
 *
 * Public / non-staff callers must not list or open:
 *   - hidden / dark / _path topics
 *   - sections like admin, staff, *-staff, wizard
 *   - path segments staff/, admin/
 *   - commands whose lock requires builder+ / admin / wizard
 */

import type { HelpEntry } from "./registry.ts";

/** Sections that are staff-facing by convention. */
const STAFF_SECTIONS = new Set([
  "admin",
  "staff",
  "wizard",
  "builder",
  "bbs-staff",
  "jobs-staff",
  "mail-staff",
]);

/**
 * True when a lock string requires elevated privilege
 * (not just "connected" / public login).
 */
export function lockImpliesStaff(lock: unknown): boolean {
  if (lock == null) return false;
  const l = String(lock).toLowerCase().trim();
  if (!l) return false;
  // Common lock levels
  if (/\b(admin|wizard|superuser|staff)\b/.test(l)) return true;
  if (/\bbuilder\+?\b/.test(l)) return true;
  if (/\bperm\s*\(\s*(admin|wizard|builder)/.test(l)) return true;
  if (/\bflag\s*\(\s*(admin|wizard|superuser|staff|builder)/.test(l)) {
    return true;
  }
  return false;
}

/** Path/name implies staff docs (…/staff/…, *-staff, admin/…, _hidden). */
export function pathImpliesStaff(name: string): boolean {
  const n = String(name || "").toLowerCase().replace(/^\//, "");
  if (!n) return false;
  const segs = n.split("/").filter(Boolean);
  for (const s of segs) {
    if (s.startsWith("_")) return true;
    if (s === "staff" || s === "admin" || s === "wizard") {
      return true;
    }
    // language-staff, bbs-staff, …
    if (
      s.endsWith("-staff") || s.endsWith("-admin") ||
      s.endsWith("-wizard") || s.startsWith("staff-") ||
      s.startsWith("admin-")
    ) {
      return true;
    }
    if (s.includes("staff") || s.includes("wizard")) return true;
  }
  return false;
}

export function sectionImpliesStaff(section: string): boolean {
  const s = String(section || "").toLowerCase().trim();
  if (!s) return false;
  if (STAFF_SECTIONS.has(s)) return true;
  if (s.endsWith("-staff") || s.endsWith("-admin")) return true;
  if (s.includes("staff") || s === "wiz") return true;
  return false;
}

/**
 * True if this entry must not be shown to the public / players.
 * Staff (admin/wizard/superuser) may still see it.
 */
export function isStaffOnlyEntry(e: HelpEntry): boolean {
  if (e.hidden) return true;
  if (e.staffOnly) return true;
  if (sectionImpliesStaff(e.section)) return true;
  if (pathImpliesStaff(e.name)) return true;
  return false;
}

/** Filter topics for a viewer. */
export function filterTopicsForViewer(
  all: HelpEntry[],
  isStaff: boolean,
): HelpEntry[] {
  const named = all.filter((e) => Boolean(e.name?.trim()));
  if (isStaff) return named;
  return named.filter((e) => !isStaffOnlyEntry(e));
}
