/**
 * Plugin-owned left side-nav for a staff page (host or embed).
 *
 *   registerStaffSideNav({
 *     pageId: "mytool",
 *     groups: [{
 *       title: "Queues",
 *       items: [
 *         { id: "open", label: "Open", query: { tab: "open" } },
 *       ],
 *     }],
 *   });
 */

import { notifyStaffChrome } from "./staff-chrome.ts";

export type StaffSideNavItem = {
  id: string;
  label: string;
  desc?: string;
  icon?: string;
  /** Query string for host route or embed iframe */
  query?: Record<string, string>;
};

export type StaffSideNavGroup = {
  title?: string;
  items: StaffSideNavItem[];
};

export type StaffSideNavRegistration = {
  /** Matches StaffNavItem / StaffPage id */
  pageId: string;
  groups: StaffSideNavGroup[];
};

const _side = new Map<string, StaffSideNavRegistration>();

function isNonEmpty(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function cleanQuery(
  q: unknown,
): Record<string, string> | undefined {
  if (!q || typeof q !== "object" || Array.isArray(q)) {
    return undefined;
  }
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(q as Record<string, unknown>)) {
    const key = String(k).trim().slice(0, 40);
    if (!key) continue;
    const val = String(v ?? "").trim().slice(0, 200);
    if (!val) continue;
    out[key] = val;
  }
  return Object.keys(out).length ? out : undefined;
}

function cleanItem(raw: unknown): StaffSideNavItem | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (!isNonEmpty(r.id) || !isNonEmpty(r.label)) return null;
  return {
    id: r.id.trim().slice(0, 64),
    label: r.label.trim().slice(0, 80),
    desc: isNonEmpty(r.desc) ? r.desc.trim().slice(0, 120) : undefined,
    icon: isNonEmpty(r.icon) ? r.icon.trim().slice(0, 8) : undefined,
    query: cleanQuery(r.query),
  };
}

/** Register or replace side-nav for a staff page. */
export function registerStaffSideNav(
  reg: StaffSideNavRegistration,
): void {
  if (!isNonEmpty(reg.pageId)) return;
  if (!Array.isArray(reg.groups) || !reg.groups.length) return;

  const groups: StaffSideNavGroup[] = [];
  for (const g of reg.groups.slice(0, 20)) {
    if (!g || typeof g !== "object") continue;
    const items: StaffSideNavItem[] = [];
    const rawItems = Array.isArray(g.items) ? g.items : [];
    for (const it of rawItems.slice(0, 40)) {
      const clean = cleanItem(it);
      if (clean) items.push(clean);
    }
    if (!items.length) continue;
    groups.push({
      title: isNonEmpty(g.title)
        ? g.title.trim().slice(0, 80)
        : undefined,
      items,
    });
  }
  if (!groups.length) return;

  const pageId = reg.pageId.trim();
  _side.set(pageId, { pageId, groups });
  notifyStaffChrome();
}

export function unregisterStaffSideNav(pageId: string): void {
  if (!isNonEmpty(pageId)) return;
  _side.delete(pageId.trim());
  notifyStaffChrome();
}

export function getStaffSideNav(
  pageId: string,
): StaffSideNavRegistration | undefined {
  return _side.get(pageId.trim());
}

/** Map pageId → registration (snapshot-friendly). */
export function listStaffSideNav(): Record<
  string,
  StaffSideNavRegistration
> {
  const out: Record<string, StaffSideNavRegistration> = {};
  for (const [k, v] of _side) {
    out[k] = {
      pageId: v.pageId,
      groups: v.groups.map((g) => ({
        title: g.title,
        items: g.items.map((it) => ({ ...it, query: it.query
          ? { ...it.query }
          : undefined })),
      })),
    };
  }
  return out;
}

export function clearStaffSideNav(): void {
  _side.clear();
}
