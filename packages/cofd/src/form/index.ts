export type {
  FormState,
  FormSystem,
  MaskForm,
  WerewolfFormName,
} from "./types.ts";
export {
  defaultFormState,
  isMaskForm,
} from "./types.ts";
export {
  applyMaskShift,
  isChangelingSheet,
  maskFormList,
  maskStatusLine,
  type MaskShiftResult,
} from "./mask.ts";
export {
  ANIMAL_FORMS,
  animalListLine,
  chrysalisSlotCount,
  currentAnimal,
  findAnimal,
  hasChrysalis,
  maxAnimalSize,
  normalizeAnimalsField,
  unlockedAnimals,
  type AnimalForm,
} from "./animals.ts";
export {
  applyAnimalShift,
  type AnimalShiftResult,
} from "./animal_shift.ts";
export {
  contractExceptionalActive,
  isMienActive,
  restoreMaskAtSceneEnd,
} from "./mien.ts";
export {
  animalMovementLine,
  animalPerceptionBonus,
  animalSensesLine,
  effectiveSpeed,
  isPerceptionRoll,
} from "./senses.ts";
export {
  applyLoopholeCost,
  applyMienContractBoost,
  contractHasDicePool,
  contractHasLoophole,
  contractPoolExpr,
  courtMantlePoolBonus,
  matchingSeemingClauses,
  ownsContract,
  parseContractCost,
  resolveOwnedContract,
} from "./contract_invoke.ts";
export {
  applyEffectHooks,
  applyHooksToTarget,
  parseEffectHooks,
  type ApplyHooksResult,
  type EffectHook,
} from "./contract_effects.ts";
export {
  acuteSensesBonus,
  goodwillDots,
  mantleDots,
  ownMantle,
  pandemoniacalBonus,
  stableTrodDots,
} from "./mantle.ts";
export {
  mantleBonusHelp,
  mantleRollBonus,
  type MantleBonusResult,
} from "./mantle_bonus.ts";
export {
  isPhysicalRoll,
  mantleAggravatedDefend,
  mantleContractGlamourDiscount,
  mantleConvertClarity,
  mantleProtectorArmor,
  mantleWipeDebt,
  mantleWinterWoundBonus,
} from "./mantle_high.ts";
export {
  buildClashPools,
  resolveClashOutcome,
  type ClashPools,
  type ClashWinner,
} from "./clash.ts";
export {
  coldIronNote,
  frailtyActPenalty,
  frailtySummaryLines,
  listFrailties,
  parseFrailty,
  type ParsedFrailty,
} from "./frailty.ts";

/** Prose helpers for look: mask / mien short lines on the sheet. */
export function sheetMaskProse(sheet: {
  customFields?: Record<string, string>;
}): string {
  const m = sheet.customFields?.mask?.trim();
  return m ?? "";
}

export function sheetMienProse(sheet: {
  customFields?: Record<string, string>;
}): string {
  const m = sheet.customFields?.mien?.trim();
  return m ?? "";
}

/**
 * Short-desc for room lists when Mask system is active.
 * Animal form: prefer mien prose if Mask was down, else a short tag.
 */
export function formLookShortDesc(sheet: {
  template?: string;
  formState?: {
    system?: string;
    current?: string;
    priorMask?: string;
  };
  customFields?: Record<string, string>;
  hedgeState?: { inHedge?: boolean };
}): string {
  if (sheet.template?.toLowerCase() !== "changeling") return "";
  const fs = sheet.formState;
  // No Mask inside the Hedge — always show mien prose.
  const inHedge = sheet.hedgeState?.inHedge === true;
  if (fs?.system === "animal") {
    const slug = fs.current ?? "beast";
    if (fs.priorMask === "mien" || inHedge) {
      const mien = sheetMienProse(sheet);
      if (mien) return `${mien} [${slug}]`;
    }
    return `A ${slug} with something wrong in the eyes.`;
  }
  if (inHedge || (fs?.system === "mask" && fs.current === "mien")) {
    return sheetMienProse(sheet);
  }
  return sheetMaskProse(sheet);
}
