/**
 * Street Rat (Template) packages — CPR core.
 * STATs: roll 1d10, take that row (cannot rearrange).
 * Skills: fixed ranks per Role (basics + professional).
 * Cultural-origin Language +4 is applied when lifepath
 * cultural is set (separate from Streetslang).
 *
 * Source: core Streetrat tables. Media STAT rows from core
 * table (extract OCR gap for that Role).
 */
import type { Role, StatKey } from "../db/schemas.ts";

export type StreetratStatRow = Readonly<Record<StatKey, number>>;

/** 10 STAT arrays per Role — index 0 = roll 1 … 9 = roll 10. */
export const STREETRAT_STAT_TEMPLATES: Readonly<
  Record<Role, readonly StreetratStatRow[]>
> = {
  rockerboy: [
    {
      int: 7, ref: 6, dex: 6, tech: 5, cool: 6,
      will: 8, luck: 7, move: 7, body: 3, emp: 8,
    },
    {
      int: 3, ref: 7, dex: 7, tech: 7, cool: 7,
      will: 6, luck: 7, move: 7, body: 5, emp: 8,
    },
    {
      int: 4, ref: 5, dex: 7, tech: 7, cool: 6,
      will: 6, luck: 7, move: 7, body: 5, emp: 8,
    },
    {
      int: 4, ref: 5, dex: 7, tech: 7, cool: 6,
      will: 8, luck: 7, move: 6, body: 3, emp: 8,
    },
    {
      int: 3, ref: 7, dex: 7, tech: 7, cool: 6,
      will: 8, luck: 6, move: 5, body: 4, emp: 7,
    },
    {
      int: 5, ref: 6, dex: 7, tech: 5, cool: 7,
      will: 8, luck: 5, move: 7, body: 3, emp: 7,
    },
    {
      int: 5, ref: 6, dex: 6, tech: 7, cool: 7,
      will: 8, luck: 7, move: 6, body: 3, emp: 6,
    },
    {
      int: 5, ref: 7, dex: 7, tech: 5, cool: 6,
      will: 6, luck: 6, move: 6, body: 4, emp: 8,
    },
    {
      int: 3, ref: 5, dex: 5, tech: 6, cool: 7,
      will: 8, luck: 7, move: 5, body: 5, emp: 7,
    },
    {
      int: 4, ref: 5, dex: 6, tech: 5, cool: 8,
      will: 8, luck: 7, move: 6, body: 4, emp: 7,
    },
  ],
  solo: [
    {
      int: 6, ref: 7, dex: 7, tech: 3, cool: 8,
      will: 6, luck: 5, move: 5, body: 6, emp: 5,
    },
    {
      int: 7, ref: 8, dex: 6, tech: 3, cool: 6,
      will: 6, luck: 7, move: 5, body: 6, emp: 6,
    },
    {
      int: 5, ref: 8, dex: 7, tech: 4, cool: 7,
      will: 7, luck: 6, move: 7, body: 8, emp: 5,
    },
    {
      int: 5, ref: 8, dex: 6, tech: 4, cool: 6,
      will: 7, luck: 6, move: 5, body: 7, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 5, cool: 7,
      will: 6, luck: 7, move: 6, body: 8, emp: 4,
    },
    {
      int: 7, ref: 7, dex: 6, tech: 5, cool: 7,
      will: 6, luck: 6, move: 7, body: 7, emp: 5,
    },
    {
      int: 7, ref: 7, dex: 6, tech: 5, cool: 6,
      will: 7, luck: 7, move: 6, body: 6, emp: 6,
    },
    {
      int: 7, ref: 8, dex: 7, tech: 5, cool: 6,
      will: 6, luck: 5, move: 6, body: 8, emp: 4,
    },
    {
      int: 7, ref: 7, dex: 6, tech: 4, cool: 6,
      will: 6, luck: 6, move: 5, body: 6, emp: 5,
    },
    {
      int: 6, ref: 6, dex: 8, tech: 5, cool: 6,
      will: 6, luck: 5, move: 6, body: 6, emp: 5,
    },
  ],
  netrunner: [
    {
      int: 5, ref: 8, dex: 7, tech: 7, cool: 7,
      will: 4, luck: 8, move: 7, body: 7, emp: 4,
    },
    {
      int: 5, ref: 6, dex: 7, tech: 5, cool: 8,
      will: 3, luck: 8, move: 7, body: 5, emp: 5,
    },
    {
      int: 5, ref: 6, dex: 8, tech: 6, cool: 6,
      will: 4, luck: 7, move: 6, body: 7, emp: 4,
    },
    {
      int: 5, ref: 7, dex: 7, tech: 7, cool: 7,
      will: 5, luck: 8, move: 6, body: 5, emp: 5,
    },
    {
      int: 5, ref: 8, dex: 8, tech: 5, cool: 7,
      will: 3, luck: 7, move: 5, body: 5, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 6, tech: 7, cool: 8,
      will: 4, luck: 7, move: 7, body: 6, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 6, tech: 7, cool: 6,
      will: 5, luck: 7, move: 7, body: 7, emp: 6,
    },
    {
      int: 5, ref: 7, dex: 8, tech: 6, cool: 8,
      will: 4, luck: 8, move: 5, body: 7, emp: 4,
    },
    {
      int: 7, ref: 6, dex: 7, tech: 7, cool: 6,
      will: 3, luck: 6, move: 5, body: 6, emp: 5,
    },
    {
      int: 7, ref: 8, dex: 6, tech: 6, cool: 6,
      will: 4, luck: 7, move: 7, body: 5, emp: 6,
    },
  ],
  tech: [
    {
      int: 6, ref: 7, dex: 7, tech: 8, cool: 4,
      will: 4, luck: 5, move: 5, body: 7, emp: 6,
    },
    {
      int: 7, ref: 6, dex: 6, tech: 7, cool: 5,
      will: 3, luck: 7, move: 7, body: 5, emp: 5,
    },
    {
      int: 8, ref: 6, dex: 5, tech: 7, cool: 5,
      will: 4, luck: 7, move: 7, body: 5, emp: 7,
    },
    {
      int: 7, ref: 8, dex: 7, tech: 8, cool: 4,
      will: 4, luck: 6, move: 5, body: 6, emp: 7,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 6, cool: 4,
      will: 3, luck: 7, move: 7, body: 6, emp: 6,
    },
    {
      int: 8, ref: 7, dex: 5, tech: 6, cool: 3,
      will: 3, luck: 7, move: 6, body: 6, emp: 7,
    },
    {
      int: 8, ref: 6, dex: 7, tech: 8, cool: 4,
      will: 4, luck: 7, move: 6, body: 7, emp: 6,
    },
    {
      int: 8, ref: 8, dex: 7, tech: 8, cool: 5,
      will: 4, luck: 6, move: 5, body: 6, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 8, cool: 3,
      will: 3, luck: 5, move: 7, body: 7, emp: 7,
    },
    {
      int: 8, ref: 8, dex: 5, tech: 6, cool: 4,
      will: 4, luck: 6, move: 5, body: 6, emp: 6,
    },
  ],
  medtech: [
    {
      int: 7, ref: 5, dex: 6, tech: 7, cool: 5,
      will: 3, luck: 8, move: 5, body: 5, emp: 7,
    },
    {
      int: 6, ref: 7, dex: 7, tech: 7, cool: 4,
      will: 4, luck: 6, move: 7, body: 7, emp: 7,
    },
    {
      int: 6, ref: 5, dex: 5, tech: 8, cool: 5,
      will: 3, luck: 8, move: 5, body: 7, emp: 8,
    },
    {
      int: 8, ref: 7, dex: 6, tech: 8, cool: 3,
      will: 5, luck: 6, move: 6, body: 5, emp: 7,
    },
    {
      int: 6, ref: 7, dex: 5, tech: 7, cool: 5,
      will: 5, luck: 8, move: 7, body: 6, emp: 8,
    },
    {
      int: 8, ref: 5, dex: 5, tech: 8, cool: 5,
      will: 5, luck: 6, move: 6, body: 5, emp: 6,
    },
    {
      int: 8, ref: 6, dex: 5, tech: 8, cool: 5,
      will: 4, luck: 8, move: 5, body: 7, emp: 7,
    },
    {
      int: 6, ref: 5, dex: 7, tech: 7, cool: 3,
      will: 5, luck: 8, move: 5, body: 5, emp: 8,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 7, cool: 5,
      will: 4, luck: 6, move: 6, body: 5, emp: 6,
    },
    {
      int: 8, ref: 7, dex: 6, tech: 6, cool: 3,
      will: 4, luck: 8, move: 7, body: 6, emp: 7,
    },
  ],
  media: [
    {
      int: 6, ref: 6, dex: 5, tech: 5, cool: 8,
      will: 7, luck: 5, move: 7, body: 5, emp: 7,
    },
    {
      int: 8, ref: 7, dex: 7, tech: 3, cool: 6,
      will: 6, luck: 6, move: 5, body: 6, emp: 8,
    },
    {
      int: 6, ref: 7, dex: 7, tech: 5, cool: 6,
      will: 8, luck: 5, move: 5, body: 5, emp: 7,
    },
    {
      int: 6, ref: 5, dex: 7, tech: 5, cool: 6,
      will: 7, luck: 5, move: 5, body: 6, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 4, cool: 8,
      will: 7, luck: 6, move: 7, body: 5, emp: 8,
    },
    {
      int: 7, ref: 5, dex: 5, tech: 4, cool: 8,
      will: 7, luck: 6, move: 7, body: 5, emp: 8,
    },
    {
      int: 8, ref: 5, dex: 6, tech: 3, cool: 7,
      will: 6, luck: 6, move: 5, body: 6, emp: 7,
    },
    {
      int: 6, ref: 5, dex: 6, tech: 5, cool: 6,
      will: 8, luck: 6, move: 6, body: 7, emp: 8,
    },
    {
      int: 7, ref: 7, dex: 5, tech: 4, cool: 6,
      will: 7, luck: 6, move: 5, body: 6, emp: 7,
    },
    {
      int: 7, ref: 6, dex: 6, tech: 3, cool: 7,
      will: 6, luck: 7, move: 6, body: 7, emp: 6,
    },
  ],
  lawman: [
    {
      int: 5, ref: 6, dex: 7, tech: 5, cool: 7,
      will: 8, luck: 5, move: 6, body: 5, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 6, tech: 5, cool: 6,
      will: 8, luck: 5, move: 7, body: 5, emp: 5,
    },
    {
      int: 5, ref: 7, dex: 7, tech: 7, cool: 6,
      will: 7, luck: 5, move: 5, body: 7, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 6, cool: 6,
      will: 8, luck: 5, move: 7, body: 7, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 6, cool: 7,
      will: 7, luck: 6, move: 5, body: 5, emp: 6,
    },
    {
      int: 7, ref: 6, dex: 5, tech: 5, cool: 7,
      will: 8, luck: 5, move: 6, body: 7, emp: 4,
    },
    {
      int: 7, ref: 8, dex: 7, tech: 5, cool: 6,
      will: 8, luck: 7, move: 6, body: 5, emp: 4,
    },
    {
      int: 5, ref: 6, dex: 6, tech: 5, cool: 6,
      will: 8, luck: 5, move: 7, body: 6, emp: 4,
    },
    {
      int: 7, ref: 7, dex: 5, tech: 5, cool: 7,
      will: 7, luck: 6, move: 5, body: 5, emp: 6,
    },
    {
      int: 6, ref: 6, dex: 5, tech: 6, cool: 8,
      will: 7, luck: 5, move: 7, body: 6, emp: 6,
    },
  ],
  exec: [
    {
      int: 8, ref: 5, dex: 5, tech: 3, cool: 8,
      will: 6, luck: 6, move: 5, body: 5, emp: 7,
    },
    {
      int: 8, ref: 6, dex: 6, tech: 4, cool: 7,
      will: 6, luck: 7, move: 7, body: 5, emp: 7,
    },
    {
      int: 8, ref: 7, dex: 6, tech: 3, cool: 8,
      will: 6, luck: 7, move: 6, body: 4, emp: 5,
    },
    {
      int: 8, ref: 5, dex: 7, tech: 5, cool: 6,
      will: 5, luck: 6, move: 5, body: 5, emp: 7,
    },
    {
      int: 7, ref: 7, dex: 6, tech: 5, cool: 8,
      will: 5, luck: 7, move: 7, body: 5, emp: 6,
    },
    {
      int: 5, ref: 7, dex: 7, tech: 3, cool: 6,
      will: 7, luck: 6, move: 5, body: 5, emp: 7,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 5, cool: 8,
      will: 7, luck: 6, move: 7, body: 4, emp: 6,
    },
    {
      int: 6, ref: 7, dex: 7, tech: 3, cool: 7,
      will: 5, luck: 7, move: 5, body: 5, emp: 7,
    },
    {
      int: 7, ref: 6, dex: 7, tech: 5, cool: 7,
      will: 5, luck: 7, move: 6, body: 5, emp: 5,
    },
    {
      int: 7, ref: 7, dex: 5, tech: 5, cool: 8,
      will: 6, luck: 6, move: 7, body: 4, emp: 7,
    },
  ],
  fixer: [
    {
      int: 8, ref: 5, dex: 7, tech: 4, cool: 6,
      will: 5, luck: 8, move: 5, body: 5, emp: 8,
    },
    {
      int: 8, ref: 5, dex: 5, tech: 5, cool: 6,
      will: 7, luck: 8, move: 7, body: 5, emp: 7,
    },
    {
      int: 6, ref: 6, dex: 6, tech: 4, cool: 5,
      will: 6, luck: 8, move: 6, body: 3, emp: 8,
    },
    {
      int: 7, ref: 7, dex: 5, tech: 5, cool: 7,
      will: 6, luck: 7, move: 7, body: 5, emp: 8,
    },
    {
      int: 8, ref: 6, dex: 6, tech: 3, cool: 6,
      will: 5, luck: 8, move: 7, body: 5, emp: 6,
    },
    {
      int: 8, ref: 7, dex: 5, tech: 5, cool: 6,
      will: 7, luck: 7, move: 5, body: 3, emp: 6,
    },
    {
      int: 8, ref: 6, dex: 6, tech: 5, cool: 6,
      will: 5, luck: 6, move: 7, body: 5, emp: 8,
    },
    {
      int: 6, ref: 6, dex: 7, tech: 4, cool: 7,
      will: 6, luck: 7, move: 7, body: 4, emp: 7,
    },
    {
      int: 8, ref: 7, dex: 7, tech: 5, cool: 5,
      will: 5, luck: 7, move: 6, body: 5, emp: 7,
    },
    {
      int: 6, ref: 5, dex: 6, tech: 5, cool: 5,
      will: 6, luck: 8, move: 6, body: 4, emp: 7,
    },
  ],
  nomad: [
    {
      int: 6, ref: 6, dex: 8, tech: 3, cool: 6,
      will: 7, luck: 6, move: 6, body: 6, emp: 4,
    },
    {
      int: 5, ref: 7, dex: 6, tech: 5, cool: 8,
      will: 8, luck: 8, move: 7, body: 5, emp: 4,
    },
    {
      int: 5, ref: 8, dex: 6, tech: 3, cool: 8,
      will: 7, luck: 6, move: 5, body: 6, emp: 5,
    },
    {
      int: 5, ref: 8, dex: 7, tech: 4, cool: 8,
      will: 6, luck: 7, move: 7, body: 7, emp: 5,
    },
    {
      int: 6, ref: 6, dex: 6, tech: 3, cool: 6,
      will: 7, luck: 6, move: 7, body: 7, emp: 4,
    },
    {
      int: 7, ref: 6, dex: 8, tech: 4, cool: 6,
      will: 7, luck: 6, move: 5, body: 6, emp: 5,
    },
    {
      int: 6, ref: 7, dex: 8, tech: 4, cool: 6,
      will: 6, luck: 7, move: 5, body: 7, emp: 5,
    },
    {
      int: 5, ref: 7, dex: 8, tech: 3, cool: 8,
      will: 6, luck: 7, move: 5, body: 5, emp: 5,
    },
    {
      int: 6, ref: 7, dex: 6, tech: 4, cool: 8,
      will: 6, luck: 6, move: 6, body: 6, emp: 6,
    },
    {
      int: 5, ref: 6, dex: 7, tech: 4, cool: 7,
      will: 8, luck: 7, move: 7, body: 7, emp: 4,
    },
  ],
};

/** Fixed skill ranks for Street Rat by Role (20 skills). */
export const STREETRAT_SKILL_TEMPLATES: Readonly<
  Record<Role, Readonly<Record<string, number>>>
> = {
  rockerboy: {
    athletics: 2, brawling: 6,
    composition: 6, concentration: 2,
    conversation: 2, education: 2,
    evasion: 6, first_aid: 6,
    handgun: 6, human_perception: 6,
    language_streetslang: 2, local_expert: 4,
    melee_weapon: 6, perception: 2,
    personal_grooming: 4, persuasion: 6,
    play_instrument: 6, stealth: 2,
    streetwise: 6, wardrobe_style: 4,
  },
  solo: {
    athletics: 2, autofire: 6,
    brawling: 2, concentration: 2,
    conversation: 2, education: 2,
    evasion: 6, first_aid: 6,
    handgun: 6, human_perception: 2,
    interrogation: 6, language_streetslang: 2,
    local_expert: 2, melee_weapon: 6,
    perception: 6, persuasion: 2,
    resist_torture_drugs: 6, shoulder_arms: 6,
    stealth: 2, tactics: 6,
  },
  netrunner: {
    athletics: 2, basic_tech: 6,
    brawling: 2, conceal_reveal_object: 6,
    concentration: 2, conversation: 2,
    cryptography: 6, cybertech: 6,
    education: 6, electronics_security_tech: 6,
    evasion: 6, first_aid: 2,
    handgun: 6, human_perception: 2,
    language_streetslang: 2, library_search: 6,
    local_expert: 2, perception: 2,
    persuasion: 2, stealth: 6,
  },
  tech: {
    athletics: 2, basic_tech: 6,
    brawling: 2, concentration: 2,
    conversation: 2, cybertech: 6,
    education: 6, electronics_security_tech: 6,
    evasion: 6, first_aid: 6,
    human_perception: 2, land_vehicle_tech: 6,
    language_streetslang: 2, local_expert: 2,
    perception: 2, persuasion: 2,
    science: 6, shoulder_arms: 6,
    stealth: 2, weaponstech: 6,
  },
  medtech: {
    athletics: 2, basic_tech: 6,
    brawling: 2, concentration: 2,
    conversation: 6, cybertech: 4,
    deduction: 6, education: 6,
    evasion: 6, first_aid: 2,
    human_perception: 6, language_streetslang: 2,
    local_expert: 2, paramedic: 6,
    perception: 2, persuasion: 2,
    resist_torture_drugs: 4, science: 6,
    shoulder_arms: 6, stealth: 2,
  },
  media: {
    athletics: 2, brawling: 2,
    bribery: 6, composition: 6,
    concentration: 2, conversation: 6,
    deduction: 6, education: 2,
    evasion: 6, first_aid: 2,
    handgun: 6, human_perception: 6,
    language_streetslang: 2, library_search: 4,
    lip_reading: 4, local_expert: 6,
    perception: 6, persuasion: 6,
    photography_film: 4, stealth: 2,
  },
  lawman: {
    athletics: 2, autofire: 6,
    brawling: 6, concentration: 2,
    conversation: 6, criminology: 6,
    deduction: 6, education: 2,
    evasion: 6, first_aid: 2,
    handgun: 6, human_perception: 2,
    interrogation: 6, language_streetslang: 2,
    local_expert: 2, perception: 2,
    persuasion: 2, shoulder_arms: 6,
    stealth: 2, tracking: 6,
  },
  exec: {
    accounting: 6, athletics: 2,
    brawling: 2, bureaucracy: 6,
    business: 6, concentration: 2,
    conversation: 6, deduction: 6,
    education: 6, evasion: 6,
    first_aid: 2, handgun: 6,
    human_perception: 6, language_streetslang: 2,
    lip_reading: 6, local_expert: 2,
    perception: 2, personal_grooming: 4,
    persuasion: 6, stealth: 2,
  },
  fixer: {
    athletics: 2, brawling: 2,
    bribery: 6, business: 6,
    concentration: 2, conversation: 6,
    education: 2, evasion: 6,
    first_aid: 2, forgery: 6,
    handgun: 6, human_perception: 6,
    language_streetslang: 4, local_expert: 6,
    perception: 2, persuasion: 4,
    pick_lock: 4, stealth: 2,
    streetwise: 6, trading: 6,
  },
  nomad: {
    animal_handling: 6, athletics: 2,
    brawling: 6, concentration: 2,
    conversation: 2, drive_land_vehicle: 6,
    education: 2, evasion: 6,
    first_aid: 6, handgun: 6,
    human_perception: 2, language_streetslang: 2,
    local_expert: 2, melee_weapon: 6,
    perception: 4, persuasion: 2,
    stealth: 6, tracking: 6,
    trading: 6, wilderness_survival: 6,
  },
};

/** Pick STAT row for roll 1–10 (clamped). */
export function streetratStatRow(
  role: Role,
  roll: number,
): StreetratStatRow {
  const rows = STREETRAT_STAT_TEMPLATES[role];
  const i = Math.min(9, Math.max(0, Math.floor(roll) - 1));
  return rows[i]!;
}

/** Street Rat skill map for a Role (copy). */
export function streetratSkills(
  role: Role,
): Record<string, number> {
  return { ...STREETRAT_SKILL_TEMPLATES[role] };
}

