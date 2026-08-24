/**
 * Point-buy and stage validation for chargen (shared telnet + HTTP).
 */
import {
  type DndAbility,
  DND_ABILITIES,
} from "../stats/dnd_sheet.ts";

export const POINT_BUY_COSTS: Record<number, number> = {
  8: 0,
  9: 1,
  10: 2,
  11: 3,
  12: 4,
  13: 5,
  14: 7,
  15: 9,
};

export function validateAbilityScores(
  abilities: Record<DndAbility, number>,
): { valid: boolean; error?: string } {
  let totalCost = 0;
  for (const ab of DND_ABILITIES) {
    const val = abilities[ab];
    if (val < 8 || val > 15) {
      return {
        valid: false,
        error:
          `Ability scores under Point Buy must be between ` +
          `8 and 15 (got ${ab}=${val}).`,
      };
    }
    totalCost += POINT_BUY_COSTS[val];
  }
  if (totalCost === 27) return { valid: true };
  return {
    valid: false,
    error:
      `Point Buy total must be exactly 27 (current: ${totalCost}).`,
  };
}
