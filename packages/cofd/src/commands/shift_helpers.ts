// Shared helpers for +shift command.

import type { IUrsamuSDK, IDBObj } from "@ursamu/ursamu";
import {
  formLookShortDesc,
  hasChrysalis,
  maskFormList,
  unlockedAnimals,
} from "../form/index.ts";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";

export function getSheet(
  obj: { state?: Record<string, unknown> },
): CofdSheet | null {
  const raw = obj.state?.cofd;
  if (!raw || typeof raw !== "object") return null;
  return migrateSheet(raw);
}

export function isStaff(actor: IDBObj): boolean {
  const f = actor.flags as Set<string> | undefined;
  if (!f) return false;
  return f.has("admin") || f.has("builder") || f.has("wizard");
}

/** Parse trailing " for <name>" for staff NPC targeting. */
export function splitForTarget(
  rest: string,
): { body: string; target: string } {
  const idx = rest.toLowerCase().lastIndexOf(" for ");
  if (idx < 0) return { body: rest.trim(), target: "" };
  return {
    body: rest.slice(0, idx).trim(),
    target: rest.slice(idx + 5).trim(),
  };
}

export async function resolveActor(
  u: IUrsamuSDK,
  targetName: string,
): Promise<IDBObj | null> {
  if (!targetName) return u.me;
  const t = await u.util.target(u.me, targetName, true);
  if (!t) {
    u.send(`Not found: ${targetName}`);
    return null;
  }
  const self = t.id === u.me.id;
  if (!self && !(await u.canEdit(u.me, t)) && !isStaff(u.me)) {
    u.send("Permission denied.");
    return null;
  }
  return t;
}

export async function syncLookShortDesc(
  u: IUrsamuSDK,
  actor: IDBObj,
  sheet: CofdSheet,
): Promise<void> {
  const prose = formLookShortDesc(sheet);
  if (!prose) return;

  const existingAttrs = actor.state?.attributes as
    | { name?: string; value?: string }[]
    | undefined;
  const attrs = Array.isArray(existingAttrs)
    ? [...existingAttrs]
    : [];
  const idx = attrs.findIndex(
    (a) =>
      a.name?.toLowerCase() === "short-desc" ||
      a.name?.toLowerCase() === "shortdesc",
  );
  if (idx >= 0) {
    attrs[idx] = { ...attrs[idx], name: "short-desc", value: prose };
  } else {
    attrs.push({ name: "short-desc", value: prose });
  }
  await u.db.modify(actor.id, "$set", {
    "data.attributes": attrs,
  });
}

export async function persistSheet(
  u: IUrsamuSDK,
  actorId: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(actorId, "$set", { "data.cofd": sheet });
}

export function changelingFormNames(sheet: CofdSheet): string[] {
  const base = [...maskFormList(), "human"];
  if (hasChrysalis(sheet)) {
    const unlocked = unlockedAnimals(sheet);
    if (unlocked.length) return [...base, ...unlocked];
  }
  return base;
}

export function announce(
  u: IUrsamuSDK,
  actor: IDBObj,
  from: string,
  to: string,
): void {
  const name = u.util.displayName(actor, u.me);
  u.broadcast?.(
    `%ch${name}%cn shifts (${from} → ${to}).`,
  );
}
