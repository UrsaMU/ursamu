// Equipment section -- equipped weapon/armor + inventory list.
// Items are real UrsaMU objects; this section queries the carrier's contents.
// When u is absent (offline tests) the section renders nothing.

import { divider } from "@ursamu/ursamu";
import {
  displayName,
  equippedArmorEntry,
  equippedWeaponEntry,
} from "../../equipment/index.ts";
import type { SheetContext, SheetSection } from "./types.ts";

function pad(s: string, n: number): string {
  return s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
}

function signed(n: number): string {
  return n >= 0 ? `+${n}` : `${n}`;
}

export const equipmentSection: SheetSection = {
  key: "equipment",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, actorId, u } = ctx;
    if (!u) return [];

    const state = sheet.equipment;
    const weaponInfo = await equippedWeaponEntry(u, state?.equippedWeapon ?? null);
    const armorInfo = await equippedArmorEntry(u, state?.equippedArmor ?? null);
    if (!weaponInfo && !armorInfo) return [];

    const lines: string[] = [];
    lines.push(await divider("E Q U I P M E N T"));

    if (weaponInfo) {
      const { obj, entry, data } = weaponInfo;
      const ammo = typeof data.currentClip === "number" && typeof entry.clip === "number"
        ? `, Ammo ${data.currentClip}/${entry.clip}`
        : "";
      lines.push(
        `  Weapon:  ${displayName(obj)}  (Dmg ${signed(entry.damage)}, Init ${signed(entry.initiative)}${ammo})`,
      );
    }

    if (armorInfo) {
      const { obj, entry } = armorInfo;
      lines.push(
        `  Armor:   ${displayName(obj)}  (${entry.ratingGeneral}/${entry.ratingBallistic}, ` +
          `Def ${signed(entry.defensePenalty)}, Spd ${signed(entry.speedPenalty)})`,
      );
    }

    return lines;
  },
};
