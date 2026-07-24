// Carry-cap rot + legacy satchel migration for fruit objects.

import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import {
  destroyItem,
  itemData,
} from "../equipment/objects.ts";
import type { CofdSheet } from "../stats/sheet.ts";
import { fruitCarryCap } from "./fruit_catalog.ts";
import {
  readFruitInv,
  writeFruitInv,
} from "./fruit_inv.ts";
import {
  createFruitObject,
  listFruitObjects,
} from "./fruit_objects.ts";

/**
 * Outside Hedge: destroy oldest fruit units until under Wyrd cap.
 */
export async function enforceFruitObjectCap(
  u: IUrsamuSDK,
  ownerId: string,
  wyrd: number,
  inHedge: boolean,
): Promise<number> {
  if (inHedge) return 0;
  const cap = fruitCarryCap(wyrd);
  if (!Number.isFinite(cap)) return 0;

  type Unit = { obj: IDBObj; gotAt: number };
  const units: Unit[] = [];
  for (const o of await listFruitObjects(u, ownerId)) {
    const d = itemData(o)!;
    const n = d.count ?? 1;
    const t = d.gotAt ?? 0;
    for (let i = 0; i < n; i++) units.push({ obj: o, gotAt: t });
  }
  if (units.length <= cap) return 0;

  units.sort((a, b) => a.gotAt - b.gotAt);
  const toRemove = units.length - Math.floor(cap);
  let removed = 0;
  const byId = new Map<string, number>();
  for (let i = 0; i < toRemove; i++) {
    const id = units[i].obj.id;
    byId.set(id, (byId.get(id) ?? 0) + 1);
  }
  for (const [id, strip] of byId) {
    const rows = await u.db.search({ id });
    const obj = rows[0] as IDBObj | undefined;
    if (!obj) continue;
    const d = itemData(obj);
    if (!d) continue;
    const cur = d.count ?? 1;
    const next = cur - strip;
    if (next <= 0) await destroyItem(u, id);
    else {
      await u.db.modify(id, "$set", {
        "data.cofd_item": { ...d, count: next },
      });
    }
    removed += strip;
  }
  return removed;
}

/** Move legacy sheet.hedgeState.fruit into objects, clear sheet. */
export async function migrateSheetFruitToObjects(
  u: IUrsamuSDK,
  ownerId: string,
  sheet: CofdSheet,
): Promise<CofdSheet> {
  const legacy = readFruitInv(sheet);
  if (legacy.length === 0) return sheet;
  for (const f of legacy) {
    await createFruitObject(
      u,
      ownerId,
      f.slug,
      f.gotAt || Date.now(),
    );
  }
  return writeFruitInv(sheet, []);
}
