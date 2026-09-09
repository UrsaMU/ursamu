// splats/vtm/data/powers/types.ts -- Power definition shapes.

export type PowerEffect =
  | "passive"
  | "celerity"
  | "roll_pose"
  | "pose"
  | "opposed" // roll vs target Willpower
  | "claws" // toggle Protean feral weapons
  | "toggle" // set a named flag on self
  | "damage" // deal damage to target on success
  | "force_blood" // force target Kindred to spend BP
  | "shape" // protean form toggle
  | "flag" // set powerFlags[key]
  | "quell"; // end target frenzy on opposed win

export type PowerResist = "willpower" | "none";

export type DamageMark = "B" | "L" | "A";

export interface IPowerDef {
  slug: string;
  discipline: string;
  level: number;
  name: string;
  bloodCost: number;
  /**
   * Blood-magic path this power belongs to (Thaumaturgy or Necromancy
   * only). Powers on the caster's *primary* path gate on the school
   * rating; powers on secondary paths gate on dots bought in the path
   * itself (stored as disciplines["<Path Name>"]).
   */
  path?: string;
  /** e.g. "Charisma+Presence" */
  pool?: string;
  difficulty?: number;
  effect: PowerEffect;
  /** Opposed powers need a target name. */
  needsTarget?: boolean;
  resist?: PowerResist;
  /** For toggle effects: char field key. */
  toggleKey?: "feralWeapons" | "obfuscated" | "heightenedSenses";
  /** damage effect */
  damageType?: DamageMark;
  damageBoxes?: number;
  /** Add Strength (or named attr) dots to damage boxes. */
  damageAttr?: string;
  /** force_blood: BP forced from target. */
  forceBlood?: number;
  /** shape: proteanForm value when on. */
  shapeForm?: "earth" | "beast" | "mist";
  /** flag: powerFlags key. */
  flagKey?: string;
  flagValue?: boolean | number | string;
  blurb: string;
  book: string;
}

export function p(def: IPowerDef): IPowerDef {
  return def;
}
