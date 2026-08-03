/**
 * Runtime top-nav contributions from plugins.
 * Merged with plugins.site.nav (config wins on same id).
 */

import type { SiteNavItem } from "./config.ts";

export type SiteNavRegistration = {
  /** Stable id — config nav with same id wins. */
  id: string;
  label: string;
  href: string;
  /** Sort key; lower first. Default 100. */
  order?: number;
};

const _nav = new Map<string, SiteNavRegistration>();

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function navKey(item: { id?: string; label?: string; href?: string }): string {
  if (isNonEmpty(item.id)) return item.id.trim().toLowerCase();
  const href = String(item.href ?? "").trim().toLowerCase();
  if (href && href !== "#") return `href:${href}`;
  return `label:${String(item.label ?? "").trim().toLowerCase()}`;
}

/** Register or replace a top-nav entry. */
export function registerSiteNav(item: SiteNavRegistration): void {
  if (!isNonEmpty(item.id) || !isNonEmpty(item.label)) return;
  if (!isNonEmpty(item.href)) return;
  const id = item.id.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/i.test(id)) return;
  _nav.set(id, {
    id,
    label: item.label.trim(),
    href: item.href.trim(),
    order: typeof item.order === "number" && Number.isFinite(item.order)
      ? item.order
      : 100,
  });
}

export function unregisterSiteNav(id: string): void {
  if (!isNonEmpty(id)) return;
  _nav.delete(id.trim().toLowerCase());
}

export function listSiteNav(): SiteNavRegistration[] {
  return [..._nav.values()].sort((a, b) => {
    const oa = a.order ?? 100;
    const ob = b.order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

export function clearSiteNav(): void {
  _nav.clear();
}

/**
 * Merge config nav + plugin nav.
 * Config wins on id collision. Sorted by order then label.
 */
export function mergeSiteNav(
  configNav: SiteNavItem[] | undefined,
  pluginNav: SiteNavRegistration[] = listSiteNav(),
): SiteNavItem[] {
  const map = new Map<string, SiteNavItem & { order: number }>();

  for (const p of pluginNav) {
    const id = navKey(p);
    map.set(id, {
      id: p.id,
      label: p.label,
      href: p.href,
      order: p.order ?? 100,
    });
  }

  const configList = configNav ?? [];
  for (let i = 0; i < configList.length; i++) {
    const c = configList[i]!;
    const id = navKey(c);
    const order = typeof c.order === "number" && Number.isFinite(c.order)
      ? c.order
      : (i + 1) * 10;
    map.set(id, {
      id: c.id ?? id,
      label: c.label,
      href: c.href,
      active: c.active,
      order,
    });
  }

  return [...map.values()]
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    })
    .map(({ order: _o, ...rest }) => rest);
}
