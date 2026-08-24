/**
 * SRD equipment catalog + class proficiency checks for shops.
 */
import equipmentJson from "../../resources/equipment.json" with {
  type: "json",
};
import type { DndSheet } from "../stats/dnd_sheet.ts";

export type GearType = "weapon" | "armor" | "shield" | "general";

export interface GearEntry {
  slug: string;
  name: string;
  type: GearType;
  /** simple|martial|light|medium|heavy|shield|gear|… */
  category: string;
  priceGp: number;
  damage?: string;
  damageType?: string;
  properties?: string[];
  weaponType?: "melee" | "ranged";
  ac?: number;
  armorType?: string;
  subtype?: string;
  book?: string;
}

export const EQUIPMENT: readonly GearEntry[] =
  equipmentJson as GearEntry[];

const bySlug = new Map<string, GearEntry>();
const byName = new Map<string, GearEntry>();
for (const e of EQUIPMENT) {
  bySlug.set(e.slug.toLowerCase(), e);
  byName.set(e.name.toLowerCase(), e);
}

export function gearBySlug(slug: string): GearEntry | undefined {
  return bySlug.get(slug.trim().toLowerCase());
}

export function gearByName(name: string): GearEntry | undefined {
  const n = name.trim().toLowerCase();
  return byName.get(n) ||
    bySlug.get(n.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
}

/** Resolve catalog entry from ware name or spec slug. */
export function resolveGear(
  name: string,
  spec = "",
): GearEntry | undefined {
  const hit = gearByName(name);
  if (hit) return hit;
  const parts = String(spec).split(":");
  // slug:longsword or longsword as first token when not type
  if (parts[0] === "slug" && parts[1]) {
    return gearBySlug(parts[1]);
  }
  if (parts[0] && !["weapon", "armor", "shield", "general"].includes(
    parts[0].toLowerCase(),
  )) {
    return gearBySlug(parts[0]);
  }
  return undefined;
}

/** Class → armor / weapon proficiency (SRD 5.2). */
export type ClassProf = {
  armor: Array<"light" | "medium" | "heavy" | "shield">;
  weapons: Array<"simple" | "martial">;
  /** Extra named weapons (e.g. longsword for bard). */
  weaponNames?: string[];
};

const CLASS_PROF: Record<string, ClassProf> = {
  barbarian: {
    armor: ["light", "medium", "shield"],
    weapons: ["simple", "martial"],
  },
  bard: {
    armor: ["light"],
    weapons: ["simple"],
    weaponNames: [
      "hand crossbow",
      "longsword",
      "rapier",
      "shortsword",
    ],
  },
  cleric: {
    armor: ["light", "medium", "shield"],
    weapons: ["simple"],
  },
  druid: {
    armor: ["light", "medium", "shield"],
    weapons: ["simple"],
    weaponNames: ["scimitar"],
  },
  fighter: {
    armor: ["light", "medium", "heavy", "shield"],
    weapons: ["simple", "martial"],
  },
  monk: {
    armor: [],
    weapons: ["simple"],
    weaponNames: ["shortsword"],
  },
  paladin: {
    armor: ["light", "medium", "heavy", "shield"],
    weapons: ["simple", "martial"],
  },
  ranger: {
    armor: ["light", "medium", "shield"],
    weapons: ["simple", "martial"],
  },
  rogue: {
    armor: ["light"],
    weapons: ["simple"],
    weaponNames: [
      "hand crossbow",
      "longsword",
      "rapier",
      "shortsword",
    ],
  },
  sorcerer: {
    armor: [],
    weapons: ["simple"],
    weaponNames: [
      "dagger",
      "dart",
      "sling",
      "quarterstaff",
      "light crossbow",
    ],
  },
  warlock: {
    armor: ["light"],
    weapons: ["simple"],
  },
  wizard: {
    armor: [],
    weapons: ["simple"],
    weaponNames: [
      "dagger",
      "dart",
      "sling",
      "quarterstaff",
      "light crossbow",
    ],
  },
};

export function classProfFor(className: string): ClassProf {
  const key = String(className || "").toLowerCase().trim();
  return CLASS_PROF[key] ?? {
    armor: [],
    weapons: ["simple"],
  };
}

/**
 * Whether the sheet is proficient with this gear.
 * General gear always returns true (always "usable").
 */
export function canUseGear(
  sheet: DndSheet | null | undefined,
  gear: GearEntry,
): boolean {
  if (!sheet) return true;
  if (gear.type === "general") return true;
  const prof = classProfFor(sheet.class || "");
  const name = gear.name.toLowerCase();
  if (prof.weaponNames?.some((w) => name === w || name.includes(w))) {
    return true;
  }
  if (gear.type === "weapon") {
    const cat = (gear.category || "simple").toLowerCase();
    return prof.weapons.includes(cat as "simple" | "martial");
  }
  if (gear.type === "armor") {
    const at = (gear.armorType || gear.category || "light")
      .toLowerCase();
    return prof.armor.includes(
      at as "light" | "medium" | "heavy" | "shield",
    );
  }
  if (gear.type === "shield") {
    return prof.armor.includes("shield");
  }
  return true;
}

/** Build state.dnd payload for a catalog gear entry. */
export function gearToDndState(
  gear: GearEntry,
  priceOverride?: number,
): Record<string, unknown> {
  const price = priceOverride ?? gear.priceGp;
  // deno-lint-ignore no-explicit-any
  const dnd: Record<string, any> = {
    slug: gear.slug,
    type: gear.type === "shield" ? "shield" : gear.type,
    equipped: false,
    valueGp: price,
    category: gear.category,
  };
  if (gear.type === "weapon") {
    dnd.damage = gear.damage || "1d6";
    dnd.damageType = gear.damageType || "slashing";
    dnd.properties = [...(gear.properties || [])];
    dnd.weaponType = gear.weaponType ||
      (dnd.properties.includes("ranged") ? "ranged" : "melee");
    dnd.weaponCategory = gear.category;
  } else if (gear.type === "armor") {
    dnd.ac = gear.ac ?? 11;
    dnd.armorType = gear.armorType || gear.category || "light";
  } else if (gear.type === "shield") {
    dnd.ac = gear.ac ?? 2;
    dnd.armorType = "shield";
  } else if (gear.subtype) {
    dnd.subtype = gear.subtype;
  }
  return dnd;
}

/** Catalog-backed vendor spec string for seed JSON. */
export function gearSpec(gear: GearEntry): string {
  return `slug:${gear.slug}`;
}
