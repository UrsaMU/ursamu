/**
 * Shared load/save helpers for rules commands.
 */
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import { migrateSheet, type DndSheet } from
  "../stats/dnd_sheet.ts";
import { syncGoldField } from "../stats/currency.ts";

export function sheetOf(t: IDBObj): DndSheet | null {
  // deno-lint-ignore no-explicit-any
  const raw = (t.state as any)?.dnd;
  if (!raw) return null;
  // migrate + sync: legacy gold:N with empty purse → money.gp
  return syncGoldField(migrateSheet(raw));
}

/** True when DB purse has no coins (shop cannot spend yet). */
export function purseNeedsSeed(raw: unknown): boolean {
  if (!raw || typeof raw !== "object") return true;
  // deno-lint-ignore no-explicit-any
  const m = (raw as any).money;
  if (!m) return true;
  return !(m.cp || m.sp || m.ep || m.gp || m.pp);
}

export async function saveSheet(
  u: IUrsamuSDK,
  t: IDBObj,
  sheet: DndSheet,
): Promise<void> {
  await u.db.modify(t.id, "$set", { "data.dnd": sheet });
  // deno-lint-ignore no-explicit-any
  if (t.state) (t.state as any).dnd = sheet;
}

export function isStaff(u: IUrsamuSDK): boolean {
  return u.me.flags.has("admin") ||
    u.me.flags.has("wizard") ||
    u.me.flags.has("superuser");
}

export async function resolveTarget(
  u: IUrsamuSDK,
  raw: string,
): Promise<IDBObj | null> {
  if (!raw) return u.me;
  const t = await u.util.target(u.me, raw, true);
  if (!t) {
    u.send(`Not found: ${raw}`);
    return null;
  }
  return t;
}
