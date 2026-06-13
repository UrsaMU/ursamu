// Equipment section -- equipped weapon/armor + inventory list.
// Items are real UrsaMU objects; this section queries the carrier's contents.
// When u is absent (offline tests) the section renders nothing.

import { divider } from "@ursamu/ursamu";
import {
  carriedItems,
  displayName,
  equippedArmorEntry,
  equippedWeaponEntry,
  itemData,
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
    const carried = await carriedItems(u, actorId);
    const hasEquipped = !!(state?.equippedWeapon || state?.equippedArmor);
    if (carried.length === 0 && !hasEquipped) return [];

    const lines: string[] = [];
    lines.push(await divider("E Q U I P M E N T"));

    const weaponInfo = await equippedWeaponEntry(u, state?.equippedWeapon ?? null);
    if (weaponInfo) {
      const { obj, entry, data } = weaponInfo;
      const ammo = typeof data.currentClip === "number" && typeof entry.clip === "number"
        ? `, Ammo ${data.currentClip}/${entry.clip}`
        : "";
      lines.push(
        `  Weapon:  ${displayName(obj)}  (Dmg ${signed(entry.damage)}, Init ${signed(entry.initiative)}${ammo})`,
      );
    }

    const armorInfo = await equippedArmorEntry(u, state?.equippedArmor ?? null);
    if (armorInfo) {
      const { obj, entry } = armorInfo;
      lines.push(
        `  Armor:   ${displayName(obj)}  (${entry.ratingGeneral}/${entry.ratingBallistic}, ` +
          `Def ${signed(entry.defensePenalty)}, Spd ${signed(entry.speedPenalty)})`,
      );
    }

    // Inventory list: unequipped items first, then equipped (shown for completeness).
    const inv = carried.filter((o) => !itemData(o)?.equippedBy);
    const equipped = carried.filter((o) => !!itemData(o)?.equippedBy);
    const ordered = [...inv, ...equipped];

    if (ordered.length > 0) {
      lines.push(`  Inventory:`);
      ordered.forEach((obj, i) => {
        const d = itemData(obj)!;
        const marks: string[] = [];
        if (state?.equippedWeapon === obj.id) marks.push("equipped");
        if (state?.equippedArmor === obj.id) marks.push("worn");
        const tag = marks.length ? ` (${marks.join(", ")})` : "";
        const ammo = typeof d.currentClip === "number" ? ` [ammo ${d.currentClip}]` : "";
        const note = d.note ? ` -- ${d.note}` : "";
        lines.push(`    ${pad(String(i + 1) + ".", 4)} ${displayName(obj)}${ammo}${tag}${note}`);
      });
    }

    return lines;
  },
};
