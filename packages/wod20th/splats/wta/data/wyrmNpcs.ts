// splats/wta/data/wyrmNpcs.ts -- Wyrm bestiary for pack hunts.
//
// Each template seeds an IWoDChar via spawnNpc() in core/npcSpawn.ts.
// Stats are intentionally flat (attribute + ability counts, no
// specialties) -- the AI driver treats them as dice pools, not as a
// full character sheet. Damage scales by category, not by exact W20
// stat block, so encounters feel right at small-pack scales.
//
// Sources: WtA W20 Ch 10 "The Enemy"; M20 Werewolf Storyteller Companion
// (banes / hellhounds); W20 Book of the Wyrm for fomori archetypes.

export type NpcKind = "bane" | "fomor" | "bsd" | "creature";

export interface IWyrmNpcAttack {
  /** "claws", "bite", "weapon", "psychic". Drives flavor + damage type. */
  mode: "claws" | "bite" | "weapon" | "psychic";
  damageType: "B" | "L" | "A";
  /** Bonus dice added to the base brawl/melee pool when this attack fires. */
  bonus: number;
}

export interface IWyrmNpcDef {
  slug: string;
  name: string;
  kind: NpcKind;
  /** One-sentence flavor for +npc/info + room spawn pose. */
  description: string;
  /** Threat rating 1-5, used to seed Rage and inform AI aggressiveness. */
  threat: 1 | 2 | 3 | 4 | 5;
  /**
   * Combat resolution model.
   *   "spirit"   = W20 Ch 7: attacks roll Rage as the pool, target's
   *                Willpower as difficulty. Used by all banes -- spirits
   *                have no physical body until they Materialize.
   *   "physical" = Standard Garou-shape resolution via attributes +
   *                abilities. Used by fomori, BSDs, hellhounds, etc.
   * Default "physical" when omitted (legacy bestiary entries).
   */
  combatModel?: "spirit" | "physical";
  /** Combat-relevant attribute dots (above the implicit base 1). */
  attributes: {
    Strength: number; Dexterity: number; Stamina: number;
    Charisma?: number; Manipulation?: number; Appearance?: number;
    Perception: number; Intelligence?: number; Wits: number;
  };
  /** Combat abilities used by the AI driver. */
  abilities: {
    Brawl?: number; Melee?: number; Firearms?: number;
    Dodge?: number; Athletics?: number; Intimidation?: number;
    Stealth?: number; Occult?: number;
  };
  willpower: number;
  rage: number;
  gnosis?: number;
  /** Max bashing health levels before incap. Default 7. */
  healthMax?: number;
  /** Aggravated soak (sturdy hides; banes have spirit fortitude). */
  aggSoak?: number;
  /** Primary attack the AI driver fires when no special tactic applies. */
  attack: IWyrmNpcAttack;
  /** Notes about special abilities -- narrated only, not coded in v1. */
  specialAbilities?: string[];
  /** Splat-flavor: most NPCs run on wta combat rules. */
  splat: "wta";
}

// Helper to compress the entries.
const npc = (def: IWyrmNpcDef): IWyrmNpcDef => def;

export const WYRM_NPCS: Record<string, IWyrmNpcDef> = {
  // -- BANES (corrupted spirits) ----------------------------------------
  "bane-roach": npc({
    slug: "bane-roach", name: "Bane-Roach", kind: "bane", splat: "wta",
    combatModel: "spirit",
    description: "A pestilent scuttling spirit; carries plague and bad fortune.",
    threat: 1,
    attributes: { Strength: 1, Dexterity: 3, Stamina: 2, Perception: 3, Wits: 2 },
    abilities: { Brawl: 2, Dodge: 3, Stealth: 4 },
    willpower: 3, rage: 3, gnosis: 4,
    healthMax: 5, aggSoak: 0,
    attack: { mode: "bite", damageType: "L", bonus: 0 },
    specialAbilities: ["Plague-touch (narrative)", "Materialize"],
  }),
  "bane-furmling": npc({
    slug: "bane-furmling", name: "Furmling Bane", kind: "bane", splat: "wta",
    combatModel: "spirit",
    description: "A small malignant spirit of resentment; manifests as a matted, snarling thing.",
    threat: 2,
    attributes: { Strength: 2, Dexterity: 3, Stamina: 3, Perception: 3, Wits: 3 },
    abilities: { Brawl: 3, Dodge: 2, Stealth: 3 },
    willpower: 5, rage: 5, gnosis: 5,
    healthMax: 7, aggSoak: 1,
    attack: { mode: "claws", damageType: "L", bonus: 1 },
    specialAbilities: ["Materialize", "Reaching (spirit-claws cross the Gauntlet)"],
  }),
  "bane-shade": npc({
    slug: "bane-shade", name: "Shade-Bane", kind: "bane", splat: "wta",
    combatModel: "spirit",
    description: "A formless terror-spirit clad in another's shadow.",
    threat: 3,
    attributes: { Strength: 3, Dexterity: 4, Stamina: 3, Perception: 4, Wits: 3 },
    abilities: { Brawl: 3, Dodge: 4, Intimidation: 4, Occult: 3 },
    willpower: 7, rage: 6, gnosis: 6,
    healthMax: 8, aggSoak: 1,
    attack: { mode: "psychic", damageType: "B", bonus: 2 },
    specialAbilities: ["Materialize", "Terror (-1 die in the target's next pool, narrative)"],
  }),
  // -- FOMORI (Wyrm-thralled mortals) -----------------------------------
  "fomor-thug": npc({
    slug: "fomor-thug", name: "Fomor Thug", kind: "fomor", splat: "wta",
    description: "A bruised, twitching human host with a single Wyrm-graft mutation.",
    threat: 2,
    attributes: { Strength: 4, Dexterity: 2, Stamina: 4, Perception: 2, Wits: 2 },
    abilities: { Brawl: 3, Melee: 2, Dodge: 1, Intimidation: 2 },
    willpower: 4, rage: 4,
    healthMax: 8, aggSoak: 0,
    attack: { mode: "weapon", damageType: "L", bonus: 2 },
    specialAbilities: ["Berserker (no flinch from Bashing)", "Wyrm-tainted blood"],
  }),
  "fomor-tentacle-host": npc({
    slug: "fomor-tentacle-host", name: "Tentacle-Host Fomor", kind: "fomor", splat: "wta",
    description: "A twisted host bearing one or more lashing, suckered tentacles.",
    threat: 3,
    attributes: { Strength: 4, Dexterity: 3, Stamina: 4, Perception: 3, Wits: 3 },
    abilities: { Brawl: 4, Dodge: 2, Athletics: 3, Intimidation: 3 },
    willpower: 6, rage: 5,
    healthMax: 9, aggSoak: 1,
    attack: { mode: "claws", damageType: "L", bonus: 2 },
    specialAbilities: ["Reach (3m grapple)", "Regenerate Bashing"],
  }),
  // -- BSDs (Black Spiral Dancers) --------------------------------------
  "bsd-ahroun": npc({
    slug: "bsd-ahroun", name: "Black Spiral Ahroun", kind: "bsd", splat: "wta",
    description: "A Black Spiral Dancer in Crinos -- claws gleaming, Wyrm-mark crawling.",
    threat: 4,
    attributes: { Strength: 5, Dexterity: 4, Stamina: 5, Perception: 3, Wits: 3 },
    abilities: { Brawl: 4, Melee: 3, Dodge: 3, Intimidation: 4, Athletics: 3 },
    willpower: 6, rage: 8, gnosis: 4,
    healthMax: 10, aggSoak: 2,
    attack: { mode: "claws", damageType: "A", bonus: 1 },
    specialAbilities: ["Regen Bashing/Lethal between turns", "Spiral Gift (narrative)"],
  }),
  // -- CREATURES --------------------------------------------------------
  "wyrm-hellhound": npc({
    slug: "wyrm-hellhound", name: "Wyrm Hellhound", kind: "creature", splat: "wta",
    description: "A shaggy, smoke-breathed hound the size of a small bear; eyes burn coal-red.",
    threat: 3,
    attributes: { Strength: 4, Dexterity: 4, Stamina: 4, Perception: 4, Wits: 3 },
    abilities: { Brawl: 4, Dodge: 2, Athletics: 3, Stealth: 2 },
    willpower: 5, rage: 6,
    healthMax: 9, aggSoak: 1,
    attack: { mode: "bite", damageType: "L", bonus: 2 },
    specialAbilities: ["Smoke breath (narrative)"],
  }),
};

/** Lookup with own-property guard. */
export function getNpcTemplate(slug: string): IWyrmNpcDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WYRM_NPCS, key)) return undefined;
  return WYRM_NPCS[key];
}

export function allNpcTemplates(): IWyrmNpcDef[] {
  return Object.values(WYRM_NPCS);
}

export function templatesByKind(kind: NpcKind): IWyrmNpcDef[] {
  return allNpcTemplates().filter((t) => t.kind === kind);
}
