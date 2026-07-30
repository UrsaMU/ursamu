/**
 * Staff console nav contributions.
 *
 * Plugins call registerStaffNav(). Prefer `route` (in-console
 * vue-router name, Phase 2). `href` is link-out fallback when
 * the host has no matching page.
 */

export type StaffNavItem = {
  /** Stable id — last register wins for the same id. */
  id: string;
  /**
   * Human title from the plugin (nav tab + page H1).
   * Prefer the plugin's own display name, not a host hardcode.
   */
  label: string;
  /** Optional one-line blurb (page lede / side nav). */
  description?: string;
  /** External path (standalone SPA fallback). */
  href?: string;
  /** In-console vue-router name (Phase 2). */
  route?: string;
  /** Sort key; lower first. Default 100. */
  order?: number;
  /**
   * Host-known badge source:
   *   bbs:activity | bbs:flagged | jobs:open |
   *   wiki:drafts | players:online
   */
  badgeKey?: string;
  badgeTitle?: string;
};

const _nav = new Map<string, StaffNavItem>();

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Register or replace a top-level staff nav entry. */
export function registerStaffNav(item: StaffNavItem): void {
  if (!isNonEmptyString(item.id) || !isNonEmptyString(item.label)) {
    return;
  }
  const href = item.href?.trim();
  const route = item.route?.trim();
  if (!href && !route) return;

  const id = item.id.trim();
  const description = item.description?.trim();
  _nav.set(id, {
    id,
    label: item.label.trim(),
    description: description || undefined,
    href: href || undefined,
    route: route || undefined,
    order: typeof item.order === "number" && Number.isFinite(item.order)
      ? item.order
      : 100,
    badgeKey: item.badgeKey?.trim() || undefined,
    badgeTitle: item.badgeTitle?.trim() || undefined,
  });
}

export function unregisterStaffNav(id: string): void {
  if (!isNonEmptyString(id)) return;
  _nav.delete(id.trim());
}

/** Sorted copy for API / snapshot. */
export function listStaffNav(): StaffNavItem[] {
  return [..._nav.values()].sort((a, b) => {
    const oa = a.order ?? 100;
    const ob = b.order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

/** Test helper. */
export function clearStaffNav(): void {
  _nav.clear();
}
