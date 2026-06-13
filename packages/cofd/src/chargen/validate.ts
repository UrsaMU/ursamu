// Mathematical validation of pool budgets for each character generation stage.

import {
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
  COFD_VIRTUE_NAMES,
  COFD_VICE_NAMES,
  findVice,
  findVirtue,
  findAuspice,
  findTribe,
  favoredRegaliaForSeeming,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  powerLabel,
  resolveCustomFieldValue,
  startingMeritDots,
  startingPowerDots,
  type CofdCgState,
} from "./state.ts";
import { validateGiftStage } from "./gifts.ts";
import { validateContractStage } from "./contracts.ts";

/**
 * Mathematically validates the parameters for the current stage.
 */
export function validateCurrentStage(cgState: CofdCgState): { valid: boolean; error?: string } {
  const stage = cgState.stage;
  const sheet = cgState.sheet;
  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey];

  if (!tmpl) {
    return { valid: false, error: `Invalid template: '${sheet.template}'. Please select a valid template in Stage 2.` };
  }

  switch (stage) {
    case 1:
      if (!sheet.concept || sheet.concept.trim().toLowerCase() === "unknown") {
        return { valid: false, error: "Concept cannot be empty or 'Unknown'." };
      }
      if (!sheet.virtue || sheet.virtue.trim().toLowerCase() === "unknown") {
        return { valid: false, error: "Virtue cannot be empty or 'Unknown'." };
      }
      if (!findVirtue(sheet.virtue)) {
        return {
          valid: false,
          error: `Invalid Virtue '${sheet.virtue}'. Valid Virtues: ${COFD_VIRTUE_NAMES.join(", ")}.`,
        };
      }
      if (!sheet.vice || sheet.vice.trim().toLowerCase() === "unknown") {
        return { valid: false, error: "Vice cannot be empty or 'Unknown'." };
      }
      if (!findVice(sheet.vice)) {
        return {
          valid: false,
          error: `Invalid Vice '${sheet.vice}'. Valid Vices: ${COFD_VICE_NAMES.join(", ")}.`,
        };
      }
      break;

    case 2:
      // Validated above
      break;

    case 3:
      for (const f of tmpl.customFields) {
        const val = sheet.customFields[f];
        if (!val || val.trim().toLowerCase() === "unknown" || val.trim().toLowerCase() === "not set") {
          return { valid: false, error: `Template field '${f}' is not set. All custom details are required.` };
        }
        const res = resolveCustomFieldValue(sheet.template, f, val);
        if (res.kind === "invalid") {
          return { valid: false, error: res.error };
        }
      }
      // Changeling: the chosen second favored Regalia must differ from the
      // seeming's own favored Regalia.
      if (sheet.template === "changeling") {
        const seemingFav = favoredRegaliaForSeeming(sheet.customFields?.seeming ?? "");
        const second = (sheet.customFields?.favored ?? "").trim();
        if (seemingFav && second && seemingFav.toLowerCase() === second.toLowerCase()) {
          return {
            valid: false,
            error: `Your second favored Regalia must differ from your seeming's favored Regalia (${seemingFav}).`,
          };
        }
      }
      break;

    case 4: {
      const atts = sheet.attributes;
      const mExt = (atts.intelligence || 1) - 1 + (atts.wits || 1) - 1 + (atts.resolve || 1) - 1;
      const pExt = (atts.strength || 1) - 1 + (atts.dexterity || 1) - 1 + (atts.stamina || 1) - 1;
      const sExt = (atts.presence || 1) - 1 + (atts.manipulation || 1) - 1 + (atts.composure || 1) - 1;

      const extras = [mExt, pExt, sExt].sort((a, b) => a - b);
      if (extras[0] !== 3 || extras[1] !== 4 || extras[2] !== 5) {
        return {
          valid: false,
          error: `Attribute pools are invalid. You must allocate your extra dots to a permutation of {5, 4, 3}.\n` +
                 `Currently: Mental (+${mExt}), Physical (+${pExt}), Social (+${sExt}).`
        };
      }
      break;
    }

    case 5: {
      const sks = sheet.skills;
      const mSum = COFD_MENTAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);
      const pSum = COFD_PHYSICAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);
      const sSum = COFD_SOCIAL_SKILLS.reduce((acc, s) => acc + (sks[s] || 0), 0);

      const sums = [mSum, pSum, sSum].sort((a, b) => a - b);
      if (sums[0] !== 7 || sums[1] !== 9 || sums[2] !== 11) {
        return {
          valid: false,
          error: `Skill pools are invalid. You must allocate your skills to a permutation of {11, 9, 7}.\n` +
                 `Currently: Mental (${mSum}), Physical (${pSum}), Social (${sSum}).`
        };
      }
      break;
    }

    case 6: {
      const meritBudget = startingMeritDots(sheet.template);
      const allocatedMerits = Object.keys(sheet.merits || {}).reduce((acc, m) => acc + (sheet.merits[m] || 0), 0);
      if (allocatedMerits !== meritBudget) {
        return {
          valid: false,
          error: `Merits allocation is invalid. You must allocate exactly ${meritBudget} starting merits dots.\n` +
                 `Currently allocated: ${allocatedMerits} dots.`
        };
      }
      break;
    }

    case 7: {
      // Changeling Stage 7 is discrete Contract selection, not dot allocation.
      if (sheet.template === "changeling") {
        return validateContractStage(sheet);
      }

      const startingDots = startingPowerDots(sheet.template, sheet.customFields?.tribe);

      const pName = powerLabel(sheet.template);
      const allocatedPowers = tmpl.validPowers.reduce((acc, p) => acc + (sheet.powers[p] || 0), 0);
      if (allocatedPowers !== startingDots) {
        return {
          valid: false,
          error: `${pName} allocation is invalid. You must allocate exactly ${startingDots} starting ${pName.toLowerCase()} dots.\n` +
                 `Currently allocated: ${allocatedPowers} dots.`
        };
      }

      // Werewolf: a character may not place a third dot in any single Renown at creation.
      if (sheet.template === "werewolf") {
        const over = tmpl.validPowers.find((p) => (sheet.powers[p] || 0) > 2);
        if (over) {
          return {
            valid: false,
            error: `Renown allocation is invalid. No single Renown may exceed 2 dots at creation.\n` +
                   `${over.replace(/\b\w/g, (c) => c.toUpperCase())} is set to ${sheet.powers[over]}.`,
          };
        }
        // The auspice and (non-Ghost-Wolf) tribal Renown must each carry a dot,
        // so the auspice Moon Gift and tribal Shadow Gifts are takeable in Stage 8.
        const auspice = findAuspice(sheet.customFields?.auspice ?? "");
        if (auspice && (sheet.powers[auspice.renown.toLowerCase()] || 0) < 1) {
          return { valid: false, error: `Place at least one Renown dot in ${auspice.renown} (your auspice Renown).` };
        }
        const tribe = findTribe(sheet.customFields?.tribe ?? "");
        if (tribe && tribe.renown !== "None" && (sheet.powers[tribe.renown.toLowerCase()] || 0) < 1) {
          return { valid: false, error: `Place at least one Renown dot in ${tribe.renown} (your tribal Renown).` };
        }
      }
      break;
    }

    case 8:
      // Werewolf Gifts & Rites.
      return validateGiftStage(sheet);
  }

  return { valid: true };
}
