// Flag-gated fae / spirit sight for dual look layers.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

/** Gameline sight flags managed by approve / template sync. */
export const SIGHT_FLAGS = ["fae", "forsaken"] as const;
export type SightFlag = (typeof SIGHT_FLAGS)[number];

export interface SightSheet {
  template?: string;
  /** Staff-granted flags kept when template no longer requires them. */
  sightSticky?: string[];
}

/** Flags required by sheet template (lowercase). */
export function templateSightFlags(
  template: string | undefined,
): SightFlag[] {
  const t = (template ?? "mortal").toLowerCase().trim();
  if (t === "changeling") return ["fae"];
  if (t === "werewolf") return ["forsaken"];
  return [];
}

export function hasSightFlag(
  actor: IDBObj | null | undefined,
  flag: SightFlag,
): boolean {
  if (!actor?.flags) return false;
  return actor.flags.has(flag);
}

/** True Fae layer: changeling flag, or staff. */
export function hasFaeSight(
  actor: IDBObj | null | undefined,
): boolean {
  if (!actor?.flags) return false;
  if (actor.flags.has("fae")) return true;
  if (actor.flags.has("wizard")) return true;
  if (actor.flags.has("admin")) return true;
  if (actor.flags.has("superuser")) return true;
  return false;
}

/**
 * Ensure object flags match template; keep sticky extras.
 * Mutates target.flags in-memory and persists via setFlags.
 */
export async function syncSightFlags(
  u: IUrsamuSDK,
  target: IDBObj,
  sheet: SightSheet,
): Promise<string[]> {
  const required = new Set(templateSightFlags(sheet.template));
  const sticky = new Set(
    (sheet.sightSticky ?? []).map((s) => s.toLowerCase().trim()),
  );
  const parts: string[] = [];

  for (const f of SIGHT_FLAGS) {
    const has = target.flags.has(f);
    if (required.has(f)) {
      if (!has) parts.push(f);
    } else if (has && !sticky.has(f)) {
      parts.push(`!${f}`);
    }
  }

  if (parts.length === 0) return [];

  if (typeof u.setFlags === "function") {
    await u.setFlags(target.id, parts.join(" "));
  }

  for (const p of parts) {
    if (p.startsWith("!")) target.flags.delete(p.slice(1));
    else target.flags.add(p);
  }
  return parts;
}
