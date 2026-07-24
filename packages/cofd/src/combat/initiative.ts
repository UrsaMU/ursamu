/**
 * CofD initiative formula only.
 * Engine activate/sort lives in @ursamu/combat.
 */
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";
import type { CofdSheet } from "../stats/index.ts";
import {
  isWeaponType,
  lookupItem,
  type WeaponEntry,
} from "../equipment/catalog.ts";
import { itemData } from "../equipment/objects.ts";
import { fastReflexesBonus } from "./modifiers.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

/** Roll 1d10. Extracted for easy stubbing in tests. */
export function roll1d10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * CofD formula: 1d10 + Dex + Composure + weapon.initiative + Fast Reflexes.
 */
export async function computeCofdInitiative(
  u: IUrsamuSDK,
  actorId: string,
): Promise<number> {
  // deno-lint-ignore no-explicit-any
  const actors = await u.db.search({ id: actorId } as any);
  const actor = actors[0] as IDBObj | undefined;
  if (!actor) return 0;

  const sheet = actor.state?.cofd as CofdSheet | undefined;
  const dex =
    sheet?.attributes?.dexterity ??
    sheet?.attributes?.Dexterity ??
    1;
  const composure =
    sheet?.attributes?.composure ??
    sheet?.attributes?.Composure ??
    1;

  let weaponMod = 0;
  const weaponId = sheet?.equipment?.equippedWeapon;
  if (weaponId) {
    const weaponObjs = await u.db.search({ id: weaponId } as Q);
    if (weaponObjs[0]) {
      const d = itemData(weaponObjs[0]);
      if (d) {
        const resolved = lookupItem(d.key);
        if (resolved && isWeaponType(resolved.type)) {
          weaponMod =
            (resolved.entry as WeaponEntry).initiative ?? 0;
        }
      }
    }
  }

  const die = roll1d10();
  const reflexes = fastReflexesBonus(sheet);
  return die + dex + composure + weaponMod + reflexes;
}
