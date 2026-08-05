/**
 * Unified staff page + nav registration.
 *
 * Kinds:
 *   host  — vue-router name already in the SPA (route)
 *   embed — in-console iframe (embed URL, usually /admin/<id>/)
 *   link  — navigate away (href)
 */

import {
  registerStaffNav,
  unregisterStaffNav,
  type StaffNavItem,
} from "./staff-nav.ts";

export type StaffPage = {
  id: string;
  label: string;
  description?: string;
  order?: number;
  badgeKey?: string;
  badgeTitle?: string;
  /** Host vue-router name */
  route?: string;
  /** In-console embed src (same-origin preferred) */
  embed?: string;
  /**
   * Allowlisted origin for cross-origin embed URLs.
   * Required when embed is https://… on another host.
   */
  embedOrigin?: string;
  /**
   * Same-origin ESM module URL exporting a Vue default component.
   * Host dynamically addRoute's it (fallback: embed/href).
   */
  module?: string;
  /** Full navigation fallback */
  href?: string;
};

const _pages = new Map<string, StaffPage>();

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function normalizePage(item: StaffPage): StaffPage | null {
  if (!isNonEmpty(item.id) || !isNonEmpty(item.label)) return null;
  const id = item.id.trim();
  const route = item.route?.trim() || undefined;
  const embed = item.embed?.trim() || undefined;
  const href = item.href?.trim() || undefined;
  const mod = item.module?.trim() || undefined;
  let embedOrigin = item.embedOrigin?.trim() || undefined;
  // Prefer route > module > embed > href
  let kindRoute = route;
  let kindEmbed = embed;
  let kindHref = href;
  const kindModule = mod;
  if (kindRoute && !kindModule) {
    // host route only
    kindEmbed = undefined;
    kindHref = undefined;
    embedOrigin = undefined;
  } else if (kindModule) {
    // module pages get a synthetic route name if none given
    kindRoute = kindRoute || `ext-${id}`;
    kindHref = undefined;
    // keep embed as fallback if module load fails (client)
  } else if (kindEmbed) {
    kindHref = undefined;
    if (/^https?:\/\//i.test(kindEmbed)) {
      try {
        const u = new URL(kindEmbed);
        const origin = embedOrigin || u.origin;
        if (embedOrigin && embedOrigin !== u.origin) {
          return null;
        }
        embedOrigin = origin;
      } catch {
        return null;
      }
    } else {
      embedOrigin = undefined;
    }
  }
  if (!kindRoute && !kindEmbed && !kindHref && !kindModule) {
    return null;
  }

  return {
    id,
    label: item.label.trim(),
    description: item.description?.trim() || undefined,
    order: typeof item.order === "number" && Number.isFinite(item.order)
      ? item.order
      : 100,
    badgeKey: item.badgeKey?.trim() || undefined,
    badgeTitle: item.badgeTitle?.trim() || undefined,
    route: kindRoute,
    embed: kindEmbed,
    embedOrigin,
    module: kindModule,
    href: kindHref,
  };
}

function toNav(page: StaffPage): StaffNavItem {
  // Embed-only (no host route / module) → plugin-embed shell
  if (page.embed && !page.route && !page.module) {
    return {
      id: page.id,
      label: page.label,
      description: page.description,
      order: page.order,
      badgeKey: page.badgeKey,
      badgeTitle: page.badgeTitle,
      embed: page.embed,
      embedOrigin: page.embedOrigin,
      route: "plugin-embed",
    };
  }
  return {
    id: page.id,
    label: page.label,
    description: page.description,
    order: page.order,
    badgeKey: page.badgeKey,
    badgeTitle: page.badgeTitle,
    route: page.route,
    href: page.href,
    embed: page.embed,
    embedOrigin: page.embedOrigin,
    module: page.module,
  };
}

/** Register page + upsert matching top-nav entry. */
export function registerStaffPage(item: StaffPage): void {
  const page = normalizePage(item);
  if (!page) return;
  _pages.set(page.id, page);
  registerStaffNav(toNav(page));
}

export function unregisterStaffPage(id: string): void {
  if (!isNonEmpty(id)) return;
  const key = id.trim();
  _pages.delete(key);
  unregisterStaffNav(key);
}

export function listStaffPages(): StaffPage[] {
  return [..._pages.values()].sort((a, b) => {
    const oa = a.order ?? 100;
    const ob = b.order ?? 100;
    if (oa !== ob) return oa - ob;
    return a.id.localeCompare(b.id);
  });
}

export function getStaffPage(id: string): StaffPage | undefined {
  return _pages.get(id.trim());
}

export function clearStaffPages(): void {
  for (const id of [..._pages.keys()]) {
    unregisterStaffNav(id);
  }
  _pages.clear();
}
