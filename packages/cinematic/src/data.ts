/** Static game data — JSON tables, slug-keyed. */
import armorData from "../data/armor.json" with { type: "json" };
import charTypesData from "../data/charactertypes.json" with { type: "json" };
import maneuversData from "../data/maneuvers.json" with { type: "json" };
import powersData from "../data/powers.json" with { type: "json" };
import qualitiesData from "../data/qualities.json" with { type: "json" };
import skillsData from "../data/skills.json" with { type: "json" };
import templatesData from "../data/templates.json" with { type: "json" };
import weaponsData from "../data/weapons.json" with { type: "json" };
import type {
  IArmor,
  ICharType,
  IManeuver,
  IPower,
  IQuality,
  ISkillDef,
  ITemplate,
  IWeapon,
} from "./types.ts";

export const CHAR_TYPES: readonly ICharType[] =
  charTypesData as ICharType[];
export const SKILLS: readonly ISkillDef[] = skillsData as ISkillDef[];
export const QUALITIES: readonly IQuality[] =
  qualitiesData as IQuality[];
export const MANEUVERS: readonly IManeuver[] =
  maneuversData as IManeuver[];
export const TEMPLATES: readonly ITemplate[] =
  templatesData as ITemplate[];
export const WEAPONS: readonly IWeapon[] = weaponsData as IWeapon[];
export const POWERS: readonly IPower[] = powersData as IPower[];
export const ARMOR: readonly IArmor[] = armorData as IArmor[];

/** Supernatural quality/power slug -> template display name. */
export function templateForQuality(slug: string): string | undefined {
  if (slug === "werewolf") return "Lycanthrope";
  if (slug === "animator") return "Animator";
  const t = templateDef(slug);
  return t && t.slug !== "mortal" ? t.name : undefined;
}

export function templateDef(slug: string): ITemplate | undefined {
  const s = slug.toLowerCase();
  return TEMPLATES.find((t) =>
    t.slug === s || t.name.toLowerCase() === s
  );
}

export function weaponDef(slug: string): IWeapon | undefined {
  return WEAPONS.find((w) => w.slug === slug);
}

export function armorDef(slug: string): IArmor | undefined {
  return ARMOR.find((a) => a.slug === slug);
}

export function charType(slug: string): ICharType | undefined {
  return CHAR_TYPES.find((t) => t.slug === slug);
}

export function skillDef(slug: string): ISkillDef | undefined {
  return SKILLS.find((s) => s.slug === slug);
}

export function qualityDef(slug: string): IQuality | undefined {
  return QUALITIES.find((q) => q.slug === slug);
}

/** Purchase catalog lookup: qualities and powers share the pool. */
export function traitDef(slug: string): IQuality | IPower | undefined {
  return qualityDef(slug) ?? powerDef(slug);
}

export function powerDef(slug: string): IPower | undefined {
  return POWERS.find((p) => p.slug === slug);
}

export function maneuverDef(slug: string): IManeuver | undefined {
  return MANEUVERS.find((m) => m.slug === slug);
}
