// Equipment catalog loader and lookup. Source data lives in
// resources/equipment.json (CoFD 2e Appendix One).

export type WeaponClass = "ranged" | "melee";
export type GearCategory = "mental" | "physical" | "social";

export interface WeaponEntry {
  key: string;
  name: string;
  damage: number;
  initiative: number;
  strength: number;
  size: number;
  availability: number;
  /** CofD 2e abstract band: "Close" | "Medium" | "Long" | "Extreme". */
  ranges?: string;
  /** CofD 2e abstract magazine class: "Low" | "Medium" | "High". */
  capacity?: string;
  /** Numeric round count for ammo tracking (currentClip vs clip). */
  clip?: number;
  example?: string;
  special?: string;
}

export interface ArmorEntry {
  key: string;
  name: string;
  ratingGeneral: number;
  ratingBallistic: number;
  strength: number;
  defensePenalty: number;
  speedPenalty: number;
  availability: number;
  coverage: string;
  concealed: boolean;
  era: "modern" | "archaic";
}

export interface GearEntry {
  key: string;
  name: string;
  diceBonus: number;
  durability: number;
  size: number;
  structure: number;
  availability: number;
  effect: string;
}

export interface ServiceEntry {
  key: string;
  name: string;
  skill: string;
  availability: number;
  diceBonus: number;
}

export interface AmmoEntry {
  key: string;
  name: string;
  /** Catalog keys of weapons this ammo loads into. */
  forWeaponKeys: string[];
  /** Round count when full (informational; clip is governed by the weapon). */
  rounds: number;
  availability: number;
  size: number;
  /** True if the magazine is small enough to conceal under street clothes. */
  concealed: boolean;
}

interface EquipmentCatalog {
  weapons: { ranged: WeaponEntry[]; melee: WeaponEntry[] };
  armor: ArmorEntry[];
  gear: { mental: GearEntry[]; physical: GearEntry[]; social: GearEntry[] };
  services: ServiceEntry[];
  ammo: AmmoEntry[];
}

const catalogUrl = new URL("../../resources/equipment.json", import.meta.url);
const ammoUrl = new URL("../../resources/ammo.json", import.meta.url);

const _baseCatalog: Omit<EquipmentCatalog, "ammo"> = JSON.parse(
  Deno.readTextFileSync(catalogUrl),
);
const _ammoFile: { ammo: AmmoEntry[] } = JSON.parse(
  Deno.readTextFileSync(ammoUrl),
);

/** Full Appendix One catalog plus the ammo extension. */
export const EQUIPMENT: EquipmentCatalog = {
  ..._baseCatalog,
  ammo: _ammoFile.ammo,
};

export type ItemType =
  | "weapon-ranged"
  | "weapon-melee"
  | "armor"
  | "gear-mental"
  | "gear-physical"
  | "gear-social"
  | "service"
  | "ammo";

export interface ResolvedItem {
  type: ItemType;
  entry: WeaponEntry | ArmorEntry | GearEntry | ServiceEntry | AmmoEntry;
}

/** Resolve a catalog key to its type-tagged entry, or undefined if unknown. */
export function lookupItem(key: string): ResolvedItem | undefined {
  if (!key) return undefined;
  const k = key.toLowerCase().trim();

  const ranged = EQUIPMENT.weapons.ranged.find((w) => w.key === k);
  if (ranged) return { type: "weapon-ranged", entry: ranged };

  const melee = EQUIPMENT.weapons.melee.find((w) => w.key === k);
  if (melee) return { type: "weapon-melee", entry: melee };

  const armor = EQUIPMENT.armor.find((a) => a.key === k);
  if (armor) return { type: "armor", entry: armor };

  const mental = EQUIPMENT.gear.mental.find((g) => g.key === k);
  if (mental) return { type: "gear-mental", entry: mental };
  const physical = EQUIPMENT.gear.physical.find((g) => g.key === k);
  if (physical) return { type: "gear-physical", entry: physical };
  const social = EQUIPMENT.gear.social.find((g) => g.key === k);
  if (social) return { type: "gear-social", entry: social };

  const service = EQUIPMENT.services.find((s) => s.key === k);
  if (service) return { type: "service", entry: service };

  const ammo = EQUIPMENT.ammo.find((a) => a.key === k);
  if (ammo) return { type: "ammo", entry: ammo };

  return undefined;
}

/** True when an item type is wearable as armor. */
export function isArmorType(type: ItemType): boolean {
  return type === "armor";
}

/** True when an item type is wieldable as a weapon. */
export function isWeaponType(type: ItemType): boolean {
  return type === "weapon-ranged" || type === "weapon-melee";
}
