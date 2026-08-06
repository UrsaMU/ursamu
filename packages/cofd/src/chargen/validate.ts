// Mathematical validation of pool budgets for each character generation stage.

import {
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
  COFD_VIRTUE_NAMES,
  COFD_VICE_NAMES,
  VTR_MASK_DIRGE_NAMES,
  findVice,
  findVirtue,
  findAuspice,
  findTribe,
  findMaskDirge,
  isInClanDiscipline,
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
import { VAMPIRE_OPTIONAL_FIELDS } from "./fields.ts";
import { validateGiftStage } from "./gifts.ts";
import { validateContractStage } from "./contracts.ts";

/** Stage-1 anchors: Virtue/Vice or Mask/Dirge for vampires. */
function validateAnchors(
  sheet: CofdCgState["sheet"],
): { valid: boolean; error?: string } {
  const isVamp =
    sheet.template.toLowerCase().trim() === "vampire";
  const aLabel = isVamp ? "Mask" : "Virtue";
  const bLabel = isVamp ? "Dirge" : "Vice";
  const aVal = sheet.virtue;
  const bVal = sheet.vice;

  if (!aVal || aVal.trim().toLowerCase() === "unknown") {
    return {
      valid: false,
      error: `${aLabel} cannot be empty or 'Unknown'.`,
    };
  }
  if (!bVal || bVal.trim().toLowerCase() === "unknown") {
    return {
      valid: false,
      error: `${bLabel} cannot be empty or 'Unknown'.`,
    };
  }

  if (isVamp) {
    if (!findMaskDirge(aVal)) {
      return {
        valid: false,
        error:
          `Invalid Mask '${aVal}'. Valid Masks/Dirges: ` +
          `${VTR_MASK_DIRGE_NAMES.join(", ")}.`,
      };
    }
    if (!findMaskDirge(bVal)) {
      return {
        valid: false,
        error:
          `Invalid Dirge '${bVal}'. Valid Masks/Dirges: ` +
          `${VTR_MASK_DIRGE_NAMES.join(", ")}.`,
      };
    }
    return { valid: true };
  }

  if (!findVirtue(aVal)) {
    return {
      valid: false,
      error:
        `Invalid Virtue '${aVal}'. Valid Virtues: ` +
        `${COFD_VIRTUE_NAMES.join(", ")}.`,
    };
  }
  if (!findVice(bVal)) {
    return {
      valid: false,
      error:
        `Invalid Vice '${bVal}'. Valid Vices: ` +
        `${COFD_VICE_NAMES.join(", ")}.`,
    };
  }
  return { valid: true };
}

/** Vampire Stage 7: 3 Discipline dots, ≥2 in-clan. */
function validateVampireDisciplines(
  sheet: CofdCgState["sheet"],
  validPowers: readonly string[],
  startingDots: number,
): { valid: boolean; error?: string } {
  const allocated = validPowers.reduce(
    (acc, p) => acc + (sheet.powers[p] || 0),
    0,
  );
  if (allocated !== startingDots) {
    return {
      valid: false,
      error:
        `Disciplines allocation is invalid. You must ` +
        `allocate exactly ${startingDots} starting ` +
        `Discipline dots.\nCurrently allocated: ` +
        `${allocated} dots.`,
    };
  }

  const clan = (sheet.customFields?.clan ?? "").trim();
  let inClan = 0;
  for (const p of validPowers) {
    const dots = sheet.powers[p] || 0;
    if (dots > 0 && isInClanDiscipline(clan, p)) {
      inClan += dots;
    }
  }
  if (inClan < 2) {
    return {
      valid: false,
      error:
        `At least 2 Discipline dots must be in-clan ` +
        `(${clan || "no clan"}). Currently in-clan: ` +
        `${inClan} dots.`,
    };
  }
  return { valid: true };
}

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
    case 1: {
      if (
        !sheet.concept ||
        sheet.concept.trim().toLowerCase() === "unknown"
      ) {
        return {
          valid: false,
          error: "Concept cannot be empty or 'Unknown'.",
        };
      }
      const anchors = validateAnchors(sheet);
      if (!anchors.valid) return anchors;
      break;
    }

    case 2:
      // Validated above
      break;

    case 3: {
      // Optional prose / lists set after chargen via +sheet/set.
      // Vampire bloodline is free-form optional at creation.
      const optionalFields = new Set([
        "mask",
        "mien",
        "animals",
        ...VAMPIRE_OPTIONAL_FIELDS,
      ]);
      // Migrate legacy single touchstone → Mask Touchstone.
      const cf = sheet.customFields ?? {};
      if (
        cf.touchstone &&
        !cf.touchstonemask
      ) {
        cf.touchstonemask = cf.touchstone;
        sheet.customFields = cf;
        sheet.touchstones = {
          ...(sheet.touchstones ?? {}),
          mask: cf.touchstone,
          dirge: sheet.touchstones?.dirge,
        };
      }
      // Prefer sheet.touchstones when custom fields empty.
      if (sheet.template === "vampire") {
        if (!cf.touchstonemask && sheet.touchstones?.mask) {
          cf.touchstonemask = sheet.touchstones.mask;
        }
        if (!cf.touchstonedirge && sheet.touchstones?.dirge) {
          cf.touchstonedirge = sheet.touchstones.dirge;
        }
        sheet.customFields = cf;
      }
      for (const f of tmpl.customFields) {
        const fl = f.toLowerCase();
        if (optionalFields.has(f) || optionalFields.has(fl)) {
          continue;
        }
        const val = sheet.customFields[f] ??
          sheet.customFields[fl];
        if (
          !val ||
          val.trim().toLowerCase() === "unknown" ||
          val.trim().toLowerCase() === "not set"
        ) {
          const label = fl === "touchstonemask"
            ? "Mask Touchstone"
            : fl === "touchstonedirge"
            ? "Dirge Touchstone"
            : f;
          return {
            valid: false,
            error: `Template field '${label}' is not set. ` +
              `All custom details are required.`,
          };
        }
        const res = resolveCustomFieldValue(sheet.template, f, val);
        if (res.kind === "invalid") {
          return { valid: false, error: res.error };
        }
      }
      // Changeling: the chosen second favored Regalia must differ from the
      // seeming's own favored Regalia.
      if (sheet.template === "changeling") {
        const seemingFav = favoredRegaliaForSeeming(
          sheet.customFields?.seeming ?? "",
        );
        const second = (sheet.customFields?.favored ?? "").trim();
        if (
          seemingFav &&
          second &&
          seemingFav.toLowerCase() === second.toLowerCase()
        ) {
          return {
            valid: false,
            error:
              `Your second favored Regalia must differ from ` +
              `your seeming's favored Regalia (${seemingFav}).`,
          };
        }
      }
      // Vampire: Mask/Dirge live on virtue/vice — re-check once
      // template is known (player may have set mortal anchors first).
      if (sheet.template === "vampire") {
        const anchors = validateAnchors(sheet);
        if (!anchors.valid) {
          return {
            valid: false,
            error:
              (anchors.error ?? "Invalid Mask/Dirge.") +
              " Use +cg/back to Stage 1 and set " +
              "mask=<archetype> / dirge=<archetype> " +
              "(+cg/list masks).",
          };
        }
      }
      break;
    }

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
      // Changeling Stage 7 is discrete Contract selection, not dots.
      if (sheet.template === "changeling") {
        return validateContractStage(sheet);
      }

      const startingDots = startingPowerDots(
        sheet.template,
        sheet.customFields?.tribe,
      );

      // Vampire: 3 Discipline dots with ≥2 in-clan.
      if (sheet.template === "vampire") {
        return validateVampireDisciplines(
          sheet,
          tmpl.validPowers,
          startingDots,
        );
      }

      const pName = powerLabel(sheet.template);
      const allocatedPowers = tmpl.validPowers.reduce(
        (acc, p) => acc + (sheet.powers[p] || 0),
        0,
      );
      if (allocatedPowers !== startingDots) {
        return {
          valid: false,
          error:
            `${pName} allocation is invalid. You must ` +
            `allocate exactly ${startingDots} starting ` +
            `${pName.toLowerCase()} dots.\n` +
            `Currently allocated: ${allocatedPowers} dots.`,
        };
      }

      // Werewolf: no Renown above 2 at creation; auspice/tribe
      // Renown each need a dot for Stage 8 Gift access.
      if (sheet.template === "werewolf") {
        const over = tmpl.validPowers.find(
          (p) => (sheet.powers[p] || 0) > 2,
        );
        if (over) {
          return {
            valid: false,
            error:
              `Renown allocation is invalid. No single ` +
              `Renown may exceed 2 dots at creation.\n` +
              `${over.replace(/\b\w/g, (c) => c.toUpperCase())}` +
              ` is set to ${sheet.powers[over]}.`,
          };
        }
        const auspice = findAuspice(
          sheet.customFields?.auspice ?? "",
        );
        if (
          auspice &&
          (sheet.powers[auspice.renown.toLowerCase()] || 0) < 1
        ) {
          return {
            valid: false,
            error:
              `Place at least one Renown dot in ` +
              `${auspice.renown} (your auspice Renown).`,
          };
        }
        const tribe = findTribe(
          sheet.customFields?.tribe ?? "",
        );
        if (
          tribe &&
          tribe.renown !== "None" &&
          (sheet.powers[tribe.renown.toLowerCase()] || 0) < 1
        ) {
          return {
            valid: false,
            error:
              `Place at least one Renown dot in ` +
              `${tribe.renown} (your tribal Renown).`,
          };
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
