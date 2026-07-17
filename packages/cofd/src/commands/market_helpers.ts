// Shared helpers for +market / +debt.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  findMarketByRoom,
  type GoblinMarket,
} from "../market/index.ts";
import { resolveDualName } from "../support/perception.ts";

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
  return f.has("admin") || f.has("builder") ||
    f.has("wizard") || f.has("superuser");
}

export function isBuilder(actor: IDBObj): boolean {
  return isStaff(actor);
}

export async function persistSheet(
  u: IUrsamuSDK,
  actorId: string,
  sheet: CofdSheet,
): Promise<void> {
  await u.db.modify(actorId, "$set", { "data.cofd": sheet });
}

export function requireChangeling(
  sheet: CofdSheet | null,
  feature = "This",
): string | null {
  if (!sheet) return "No character sheet.";
  if (!isChangelingSheet(sheet)) {
    return `${feature} is for the Lost (changeling).`;
  }
  return null;
}

export async function marketHere(
  u: IUrsamuSDK,
): Promise<GoblinMarket | null> {
  const roomId = u.here?.id;
  if (!roomId) return null;
  return await findMarketByRoom(roomId);
}

export function marketLabel(
  looker: IDBObj,
  m: GoblinMarket,
): string {
  return resolveDualName(
    looker,
    m.name,
    m.maskName ?? "Crowded bazaar",
  );
}
