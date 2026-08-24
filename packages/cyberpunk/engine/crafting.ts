/**
 * Cyberpunk RED -- Crafting / Tech Maker Utilities
 * Project creation, progress checks, completion logic.
 */
import { skillCheck, craftDVAndTime, priceToEB } from "./dice.ts";
import type { ICraftProject, IBlueprint, ICPRCharacter } from "../db/schemas.ts";
import { CYBERWARE_CATALOG } from "../data/cyberware.ts";

// -- Maker Specialty Ranks -----------------------------------------------------

export type MakerSpecialty = "field" | "upgrade" | "fabrication" | "invention";

/**
 * Get a Tech's rank in a given Maker specialty.
 * Stored as roleData.makerSpecialties[specialty].
 */
export const getMakerRank = (
  char: ICPRCharacter,
  specialty: MakerSpecialty
): number => {
  const rd = char.roleData as Record<string, unknown>;
  const specs = rd.makerSpecialties as Record<string, number> | undefined;
  return specs?.[specialty] ?? 0;
};

/** Total maker specialty points = 2 × roleRank. */
export const totalMakerPoints = (roleRank: number): number => roleRank * 2;

// -- Project Creation ---------------------------------------------------------

export interface ICraftProjectInput {
  techId: string;
  techName: string;
  itemName: string;
  type: ICraftProject["type"];
  priceCategory: string;
  skill: string;  // e.g. "weaponstech", "cybertech"
  blueprintId?: string;
}

/**
 * Create a new crafting project. Caller must deduct materials cost.
 */
export const createCraftProject = (
  input: ICraftProjectInput,
  makerRank: number
): ICraftProject => {
  const { dv, timeMs } = craftDVAndTime(input.priceCategory);
  const materialsCost = materialsRequired(input.priceCategory, input.type);
  const now = Date.now();

  return {
    id: crypto.randomUUID(),
    techId: input.techId,
    techName: input.techName,
    itemName: input.itemName,
    type: input.type,
    specialty: typeToSpecialty(input.type),
    specialtyRank: makerRank,
    dv,
    skill: input.skill,
    materialsCost,
    startedAt: now,
    completesAt: now + timeMs,
    completed: false,
    failed: false,
    blueprintId: input.blueprintId,
  };
};

const typeToSpecialty = (type: ICraftProject["type"]): ICraftProject["specialty"] => {
  if (type === "fabricate") return "fabrication";
  if (type === "upgrade") return "upgrade";
  return "invention";
};

// -- Materials Cost ------------------------------------------------------------

/**
 * Materials cost based on type:
 * - Fabricate: one price category lower (item costs 1000eb -> materials 500eb)
 * - Upgrade: same category as item being upgraded
 * - Invent: same category (assigned by GM, minimum Expensive)
 */
export const materialsRequired = (
  priceCategory: string,
  type: ICraftProject["type"]
): number => {
  const fullPrice = priceToEB(priceCategory);
  if (type === "fabricate") {
    // One category lower
    const lowerPrice = fullPrice / 5;
    return Math.max(10, lowerPrice);
  }
  // Upgrade and invent: full price category
  return fullPrice;
};

// -- Progress Check ------------------------------------------------------------

export interface ICraftCheckResult {
  roll: number;
  total: number;
  dv: number;
  success: boolean;
  ready: boolean;         // has enough real time passed?
  project: ICraftProject;
}

/**
 * Attempt a crafting project completion check.
 * Only call if project.completesAt <= Date.now().
 */
export const craftProgressCheck = (
  char: ICPRCharacter,
  project: ICraftProject,
  luckSpend = 0
): ICraftCheckResult => {
  const now = Date.now();
  const ready = now >= project.completesAt;

  if (!ready) {
    return {
      roll: 0, total: 0, dv: project.dv,
      success: false, ready: false, project,
    };
  }

  const makerRank = getMakerRank(char, project.specialty);
  const techStat = char.stats.tech;
  const skillLevel = char.skills[project.skill] ?? 0;
  // TECH + skill + makerRank + 1d10 vs DV
  const result = skillCheck(techStat, skillLevel + makerRank, project.dv);
  const total = result.total + luckSpend;
  const success = total >= project.dv;

  const updatedProject: ICraftProject = {
    ...project,
    completed: success,
    failed: !success,
  };

  return { roll: result.roll, total, dv: project.dv, success, ready, project: updatedProject };
};

// -- Field Expertise -----------------------------------------------------------

/**
 * Field Expertise: temporary repair (jury-rig).
 * Duration: 10 minutes per Field Expertise Rank.
 */
export const fieldRepairDurationMs = (fieldRank: number): number =>
  fieldRank * 10 * 60 * 1000;

/**
 * Field repair check: TECH + tech skill + Field rank + 1d10 vs item repair DV.
 */
export const fieldRepairCheck = (
  char: ICPRCharacter,
  skill: string,
  repairDV: number
): { roll: number; total: number; success: boolean } => {
  const fieldRank = getMakerRank(char, "field");
  const techStat = char.stats.tech;
  const skillLevel = char.skills[skill] ?? 0;
  const result = skillCheck(techStat, skillLevel + fieldRank, repairDV);
  return { roll: result.roll, total: result.total, success: result.success ?? false };
};

// -- Blueprints ----------------------------------------------------------------

export const createBlueprint = (
  techId: string,
  techName: string,
  itemName: string,
  description: string,
  priceCategory: string,
  skill: string
): IBlueprint => {
  const { dv } = craftDVAndTime(priceCategory);
  return {
    id: crypto.randomUUID(),
    techId,
    techName,
    itemName,
    description,
    priceCategory: priceCategory as IBlueprint["priceCategory"],
    dv,
    skill,
    createdAt: Date.now(),
  };
};

// -- Time Display --------------------------------------------------------------

export const timeRemainingDisplay = (completesAt: number): string => {
  const remaining = completesAt - Date.now();
  if (remaining <= 0) return "Ready to check!";
  const hours = Math.floor(remaining / (1000 * 60 * 60));
  const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h remaining`;
  }
  if (hours > 0) return `${hours}h ${minutes}m remaining`;
  return `${minutes}m remaining`;
};
