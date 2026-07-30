/**
 * Live staff-console badges (Phase 3).
 *
 * Plugins call setStaffBadge(key, count) after state changes.
 * Values are included in the admin WS snapshot and pushed as
 * { type: "badge:set", key, value, title? }.
 *
 * Nav items reference keys via StaffNavItem.badgeKey.
 */

export type StaffBadge = {
  key: string;
  /** Display value — empty string hides the badge. */
  value: string;
  title?: string;
};

const _badges = new Map<string, StaffBadge>();

type PushFn = (msg: {
  type: "badge:set";
  key: string;
  value: string;
  title?: string;
}) => void;

let _push: PushFn | null = null;

/** Wire to broadcastAdmin once the hub is ready. */
export function setStaffBadgePusher(fn: PushFn | null): void {
  _push = fn;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/**
 * Publish or update a badge. `count` 0 / empty clears the
 * visible chip but keeps the key (value "").
 */
export function setStaffBadge(
  key: string,
  count: number | string,
  title?: string,
): void {
  if (!isNonEmptyString(key)) return;
  const k = key.trim();
  let value = "";
  if (typeof count === "number" && Number.isFinite(count)) {
    value = count > 0 ? String(Math.floor(count)) : "";
  } else if (typeof count === "string") {
    value = count.trim();
  }
  const t = title?.trim();
  const entry: StaffBadge = {
    key: k,
    value,
    title: t || undefined,
  };
  _badges.set(k, entry);
  _push?.({
    type: "badge:set",
    key: k,
    value: entry.value,
    title: entry.title,
  });
}

export function clearStaffBadge(key: string): void {
  if (!isNonEmptyString(key)) return;
  const k = key.trim();
  _badges.delete(k);
  _push?.({ type: "badge:set", key: k, value: "" });
}

export function getStaffBadge(key: string): StaffBadge | undefined {
  return _badges.get(key.trim());
}

/** Snapshot map key → badge. */
export function listStaffBadges(): Record<string, StaffBadge> {
  const out: Record<string, StaffBadge> = {};
  for (const [k, v] of _badges) out[k] = { ...v };
  return out;
}

/** Test helper. */
export function clearAllStaffBadges(): void {
  _badges.clear();
}
