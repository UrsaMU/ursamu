/**
 * Cyberpunk RED -- Cyberpsychosis and Humanity Loss Utilities
 */
import type { ICPRCharacter, ICyberware } from "../db/schemas.ts";
import { calcCurrentEMP } from "./character.ts";
import { d6 } from "./dice.ts";
import { CYBERWARE_CATALOG } from "../data/cyberware.ts";

// -- Humanity Loss Calculation -------------------------------------------------

/**
 * Roll variable HL (e.g. "2d6") for cyberware with dice-based HL.
 */
export const rollVariableHL = (hlRoll: string): number => {
  const match = hlRoll.match(/^(\d+)d(\d+)$/i);
  if (!match) return 0;
  const [, numStr, sidesStr] = match;
  const num = parseInt(numStr, 10);
  const sides = parseInt(sidesStr, 10);
  let total = 0;
  for (let i = 0; i < num; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
};

/**
 * Calculate HL for installing a piece of cyberware.
 * Medical-grade replacements (for actual lost limbs) = 0 HL.
 */
export const calculateInstallHL = (
  cyberwareName: string,
  isMedicalReplacement = false
): number => {
  if (isMedicalReplacement) return 0;

  const def = CYBERWARE_CATALOG.find((c) => c.name === cyberwareName);
  if (!def) return 0;

  if (def.hl > 0) return def.hl;
  if (def.hlRoll) return rollVariableHL(def.hlRoll);
  return 0;
};

/**
 * Apply humanity loss from cyberware installation.
 * Returns updated HL total and new current EMP.
 */
export const applyHumanityLoss = (
  char: ICPRCharacter,
  hlAdded: number
): { newHL: number; newEMP: number; cyberpsychosisTriggered: boolean } => {
  const newHL = char.humanityLoss + hlAdded;
  const newEMP = calcCurrentEMP(char.stats.empBase, newHL);
  const cyberpsychosisTriggered = newEMP <= 0;
  return { newHL, newEMP, cyberpsychosisTriggered };
};

/**
 * Reduce humanity loss via therapy.
 * Medtech rolls Medicine (Surgery specialty): TECH + Surgery + 1d10 vs DV.
 * DV depends on total HL.
 */
export const therapyDV = (totalHL: number): number => {
  if (totalHL < 20) return 13;
  if (totalHL < 40) return 15;
  if (totalHL < 60) return 17;
  if (totalHL < 80) return 21;
  return 24;
};

/**
 * On a successful therapy session, reduce HL by 2d6 (minimum 0).
 * Returns HL reduced and new EMP.
 */
export const applyTherapy = (
  char: ICPRCharacter,
  roll: number,
  dv: number
): { success: boolean; hlReduced: number; newHL: number; newEMP: number } => {
  if (roll < dv) {
    return { success: false, hlReduced: 0, newHL: char.humanityLoss, newEMP: char.stats.emp };
  }

  const hlReduced = d6() + d6();
  const newHL = Math.max(0, char.humanityLoss - hlReduced);
  const newEMP = Math.min(char.stats.empBase, calcCurrentEMP(char.stats.empBase, newHL));

  return { success: true, hlReduced, newHL, newEMP };
};

// -- Cyberpsychosis Triggers ---------------------------------------------------

export type CyberpsychosisSeverity =
  | "none"
  | "mild"
  | "moderate"
  | "severe"
  | "full";

/**
 * EMP lost to humanity damage. HL is source of truth:
 * every 10 HL → −1 EMP. HL 0 always means lost 0
 * (natural EMP 4–6 is not cyberpsychosis).
 */
export function empLostToHumanity(
  _empBase: number,
  _empCurrent: number,
  humanityLoss = 0,
): number {
  return Math.floor(Math.max(0, Number(humanityLoss) || 0) / 10);
}

/**
 * Severity from humanity damage, not absolute EMP.
 * lost 0 → none; 1 → mild; 2 → moderate; 3+ or emp 0 → severe/full.
 */
export const cyberpsychosisSeverity = (
  emp: number,
  empBase?: number,
  humanityLoss?: number,
): CyberpsychosisSeverity => {
  if (emp <= 0) return "full";
  const lost = empBase != null
    ? empLostToHumanity(empBase, emp, humanityLoss ?? 0)
    : 0;
  if (lost <= 0) return "none";
  if (lost === 1) return "mild";
  if (lost === 2) return "moderate";
  return "severe";
};

/**
 * Skill penalty from cyberpsychosis.
 *
 * Based on **EMP lost to HL**, not absolute EMP. A natural EMP 4–6
 * character with HL 0 must not take psycho penalties.
 *
 *   lost 0          → 0
 *   lost 1 (mild)   → social -1 / other 0
 *   lost 2 (mod)    → social -2 / other -1
 *   lost 3+ / emp0  → social -4 / other -2
 *
 * Pass empBase (and ideally humanityLoss). Legacy call
 * getCyberpsychosisPenalty(emp, cat) with no base → 0 unless emp≤0.
 */
export function getCyberpsychosisPenalty(
  emp: number,
  skillCategory: "social" | "other",
  empBase?: number,
  humanityLoss?: number,
): number {
  if (emp <= 0) {
    return skillCategory === "social" ? -4 : -2;
  }
  // No base → cannot infer loss; do not punish natural low EMP
  if (empBase == null) return 0;

  const lost = empLostToHumanity(empBase, emp, humanityLoss ?? 0);
  if (lost <= 0) return 0;
  if (lost === 1) {
    return skillCategory === "social" ? -1 : 0;
  }
  if (lost === 2) {
    return skillCategory === "social" ? -2 : -1;
  }
  return skillCategory === "social" ? -4 : -2;
}

export const cyberpsychosisDescription = (
  severity: CyberpsychosisSeverity,
): string => {
  const descriptions: Record<CyberpsychosisSeverity, string> = {
    none: "Stable. No humanity damage on the clock.",
    mild:
      "Irritability, emotional detachment. Functions normally but seems 'off'.",
    moderate:
      "Frequent emotional outbursts. Perceives others as obstacles. " +
      "-2 Social.",
    severe:
      "Sees humans as inferior machines. -4 Social / -2 other checks.",
    full:
      "Full cyberpsychosis. Character is NPC-controlled. Extremely dangerous.",
  };
  return descriptions[severity];
};
