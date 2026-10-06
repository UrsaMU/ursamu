/** Data-table types for Cinematic Unisystem catalogs. */
import type { AttrKey } from "./types.ts";

export interface IQEntry {
  slug: string;
  level: number;
  note: string;
  /** Granted by a template package — not charged to the pool. */
  granted?: boolean;
}

export interface IMaskState {
  active: boolean;
  aspects: string[];
  impression: string;
}

export interface IPrereq {
  q?: string;
  qLevel?: [string, number];
  attr?: [AttrKey, number];
  skill?: [string, number];
  tier?: string;
  any?: IPrereq[];
}

export interface IPower {
  slug: string;
  name: string;
  cost: number;
  perLevel?: boolean;
  max?: number;
  attrBonus?: Partial<Record<AttrKey, number>>;
  prereq?: IPrereq;
  approval?: string;
}

export interface IQuality {
  slug: string;
  name: string;
  kind: "quality" | "drawback" | "either";
  cost: number;
  max?: number;
  perLevel?: boolean;
}

export interface ISkillDef {
  slug: string;
  name: string;
  attr: string;
}

export interface IManeuver {
  slug: string;
  name: string;
  roll: string;
  damage: string;
  type: string;
}

export interface ICharType {
  slug: string;
  name: string;
  attrPoints: number;
  qualityPoints: number;
  drawbackPoints: number;
  skillPoints: number;
  dramaPoints: number;
}

export interface IDmg {
  mult?: number;
  plus?: number;
  fixed?: number;
}

export interface IWeapon {
  slug: string;
  name: string;
  dmg: IDmg;
  type: "Bash" | "Slash/stab" | "Bullet";
  skill: string;
  range: "Melee" | "Pistol" | "Rifle";
  hands: 1 | 2;
  special?: string;
}

export interface IArmor {
  slug: string;
  name: string;
  protection: { bash: number; slash: number; bullet: number };
  coverage: string;
}

export interface ITemplate {
  slug: string;
  name: string;
  attrBonus?: Partial<Record<AttrKey, number>>;
  weaknesses?: string;
  includes?: { slug: string; level: number }[];
}
