/**
 * Runtime top-nav contributions from plugins.
 * Merged with plugins.site.nav (config wins on same id).
 *
 * Visibility: set `require` like locks / staff nav permissions:
 *   omit | "public"     — everyone
 *   "connected"         — signed in
 *   "staff"             — staff flags
 *   "flag(approved)"    — named flag
 */

import type { SiteNavItem } from "./config.ts";

export type SiteNavRegistration = {
  /** Stable id — config nav with same id wins. */
  id: string;
  label: string;
  href: string;
  /** Sort key; lower first. Default 100. */
  order?: number;
  /**
   * Visibility gate (same strings as SiteNavItem.require).
   * Plugins use this so auth-only links are not public.
   */
  require?: string;
};

/** Viewer context for require checks (FE or SSR). */
export type SiteNavAuthCtx = {
  connected: boolean;
  /** Lowercase flag names. */
  flags?: string[];
};

const STAFF_FLAGS = new Set([
  "wizard",
  "admin",
  "superuser",
  "builder",
  "staff",
  "storyteller",
]);

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

/**
 * Whether a nav `require` string is satisfied.
 * Unknown require forms fail closed when not connected.
 */
export function siteNavRequireMet(
  require: string | undefined | null,
  ctx: SiteNavAuthCtx,
): boolean {
  const r = String(require ?? "").trim().toLowerCase();
  if (!r || r === "public" || r === "any" || r === "all") {
    return true;
  }
  if (!ctx.connected) return false;

  if (
    r === "connected" ||
    r === "logged-in" ||
    r === "logged_in" ||
    r === "auth"
  ) {
    return true;
  }

  const flags = (ctx.flags ?? []).map((f) =>
    String(f).toLowerCase().trim()
  );

  if (
    r === "staff" ||
    r === "connected staff" ||
    r === "connected admin+" ||
    r === "connected admin" ||
    r === "connected wizard" ||
    r === "perm(admin)" ||
    r === "perm(staff)" ||
    r === "perm(wizard)"
  ) {
    return flags.some((f) => STAFF_FLAGS.has(f));
  }

  const fm = r.match(/^flag\(\s*([a-z0-9_-]+)\s*\)$/i);
  if (fm) {
    return flags.includes(fm[1]!.toLowerCase());
  }

  // Bare flag name
  if (/^[a-z][a-z0-9_-]*$/i.test(r)) {
    return flags.includes(r);
  }

  return false;
}

/** Filter nav items by require + auth context. */
export function filterSiteNav(
  items: SiteNavItem[],
  ctx: SiteNavAuthCtx,
): SiteNavItem[] {
  return items.filter((it) => siteNavRequireMet(it.require, ctx));
}

/** Register or replace a top-nav entry. */
export function registerSiteNav(item: SiteNavRegistration): void {
  if (!isNonEmpty(item.id) || !isNonEmpty(item.label)) return;
  if (!isNonEmpty(item.href)) return;
  const id = item.id.trim().toLowerCase();
  if (!/^[a-z][a-z0-9_-]*$/i.test(id)) return;
  const req = isNonEmpty(item.require)
    ? item.require.trim()
    : undefined;
  _nav.set(id, {
    id,
    label: item.label.trim(),
    href: item.href.trim(),
    order: typeof item.order === "number" && Number.isFinite(item.order)
      ? item.order
      : 100,
    require: req,
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
      require: p.require,
    });
  }

  const configList = configNav ?? [];
  for (let i = 0; i < configList.length; i++) {
    const c = configList[i]!;
    const id = navKey(c);
    const order = typeof c.order === "number" && Number.isFinite(c.order)
      ? c.order
      : (i + 1) * 10;
    const prev = map.get(id);
    // Config wins label/href; keep plugin require if config omits it
    const req = (typeof c.require === "string" && c.require.trim())
      ? c.require.trim()
      : prev?.require;
    map.set(id, {
      id: c.id ?? id,
      label: c.label,
      href: c.href,
      active: c.active,
      order,
      require: req,
    });
  }

  return [...map.values()]
    .sort((a, b) => {
      if (a.order !== b.order) return a.order - b.order;
      return a.label.localeCompare(b.label);
    })
    .map(({ order: _o, ...rest }) => rest);
}
