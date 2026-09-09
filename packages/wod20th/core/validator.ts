// core/validator.ts -- Per-step validators. Each returns IStepBudget.
// ChargenEngine calls these after every mutation and on advanceStep().
import type { IWoDChar, IStepBudget, IWtaSplatExt, ISplat } from "./types.ts";
import { SplatRegistry } from "./registry.ts";
import {
  ATTRIBUTE_GROUPS,
  ABILITY_GROUPS,
  ATTR_ALLOC,
  ABIL_ALLOC,
  ATTR_CATEGORY_NAMES,
  ABIL_CATEGORY_NAMES,
  SPECIALTY_OVERRIDE_LIST,
  ATTR_BASE,
} from "./attributes.ts";
import type { AttributeGroup, AbilityGroup } from "./attributes.ts";

// -- Public entry -----------------------------------------------------------

/** Validate the given step and return a budget with issues. */
export function validateStep(char: IWoDChar, step: 1 | 2 | 3 | 4 | 5 | 6): IStepBudget {
  switch (step) {
    case 1: return validateStep1(char);
    case 2: return validateStep2(char);
    case 3: return validateStep3(char);
    case 4: return validateStep4(char);
    case 5: return validateStep5(char);
    case 6: return validateStep6(char);
  }
}

// -- Step 1 -- Sub-template (breed / auspice / tribe) ------------------------

function validateStep1(char: IWoDChar): IStepBudget {
  const issues: string[] = [];
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;

  if (ext && char.splat === "wta") {
    // WtA only: breed required and must exist in registry
    if (!char.breed) {
      issues.push("breed is required (homid/metis/lupus)");
    } else {
      const breedDef = ext.breeds?.find((b) => b.id === char.breed);
      if (!breedDef) issues.push(`Unknown breed "${char.breed}"`);
    }

    if (char.splat === "wta") {
      if (!char.auspice) {
        issues.push("auspice is required");
      } else {
        const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
        if (!auspiceDef) issues.push(`Unknown auspice "${char.auspice}"`);
      }

      if (!char.tribe) {
        issues.push("tribe is required");
      } else {
        const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
        if (!tribeDef) {
          issues.push(`Unknown tribe "${char.tribe}"`);
        } else if (
          tribeDef.breedRestriction &&
          char.breed &&
          !tribeDef.breedRestriction.includes(char.breed)
        ) {
          issues.push(
            `${tribeDef.displayName} only accepts ${tribeDef.breedRestriction.join(" or ")} breed`
          );
        }
      }

      if (char.breed === "metis" && !char.deformity?.trim()) {
        issues.push("metis characters require a deformity (+chargen/set deformity=<description>)");
      }
    }
  }
  // Mortal / splats with no ext: step 1 is trivially complete

  return { step: 1, complete: issues.length === 0, issues, remaining: {} };
}

// -- Step 2 -- Concept -------------------------------------------------------

function validateStep2(char: IWoDChar): IStepBudget {
  const issues: string[] = [];

  if (!char.fullName?.trim()) issues.push("full name is required (+chargen/set fullName=<name>)");
  if (!char.concept.trim())   issues.push("concept is required (+chargen/set concept=<concept>)");
  if (!char.age?.trim())      issues.push("age is required (+chargen/set age=<age>)");
  if (!char.nature?.trim())   issues.push("nature is required (+chargen/set nature=<archetype>)");
  if (!char.demeanor?.trim()) issues.push("demeanor is required (+chargen/set demeanor=<archetype>)");

  return { step: 2, complete: issues.length === 0, issues, remaining: {} };
}

// -- Step 3 -- Attributes ----------------------------------------------------
// Once the player has moved past Step 3, freebie spends may raise attrs
// above the 7/5/3 pool. Keep only hard caps so earlier steps stay green.

function validateStep3(char: IWoDChar): IStepBudget {
  const issues: string[] = [];
  const remaining: Record<string, number> = {};
  const pastStep = char.chargenStep > 3;

  // Priority must be set
  const [pri, sec, ter] = char.attributePriority;
  const validPriority = pri && sec && ter &&
    new Set([pri, sec, ter]).size === 3 &&
    ATTR_CATEGORY_NAMES.includes(pri as AttributeGroup) &&
    ATTR_CATEGORY_NAMES.includes(sec as AttributeGroup) &&
    ATTR_CATEGORY_NAMES.includes(ter as AttributeGroup);

  if (!validPriority) {
    issues.push("Set attribute priority first: +chargen/priority attrs=physical/social/mental");
    return { step: 3, complete: false, issues, remaining };
  }

  const alloc: Record<string, number> = {
    [pri]: ATTR_ALLOC.primary,
    [sec]: ATTR_ALLOC.secondary,
    [ter]: ATTR_ALLOC.tertiary,
  };

  for (const group of ATTR_CATEGORY_NAMES) {
    const budget = alloc[group];
    const attrs = ATTRIBUTE_GROUPS[group as AttributeGroup];
    const spent = attrs.reduce((sum, a) => sum + (char.attributes[a] ?? 0), 0);
    const rem = budget - spent;
    remaining[`${group}Dots`] = pastStep ? Math.min(0, rem) : rem;
    // Exact pool only while still ON step 3. Freebies later may overshoot.
    if (!pastStep) {
      if (rem < 0) {
        issues.push(`${group} has ${-rem} too many extra dots`);
      }
      if (rem > 0) {
        issues.push(
          `${group} needs ${rem} more extra dot${rem === 1 ? "" : "s"}`,
        );
      }
    }
  }

  // Cap check: no attribute > 5 total (ATTR_BASE + extra)
  for (const [attr, extra] of Object.entries(char.attributes)) {
    if ((ATTR_BASE + extra) > 5) {
      issues.push(`${attr} exceeds max of 5`);
    }
  }

  // Specialty: only on attrs at final value >= 4
  for (const [attr, spec] of Object.entries(char.attributeSpecialties)) {
    if (spec) {
      const total = ATTR_BASE + (char.attributes[attr] ?? 0);
      if (total < 4) {
        issues.push(
          `${attr} specialty requires value >= 4 (currently ${total})`,
        );
      }
    }
  }

  return { step: 3, complete: issues.length === 0, issues, remaining };
}

// -- Step 4 -- Abilities -----------------------------------------------------
// Past Step 4, freebies may push abilities above 3 and over the 13/9/5 pool.

function validateStep4(char: IWoDChar): IStepBudget {
  const issues: string[] = [];
  const remaining: Record<string, number> = {};
  const pastStep = char.chargenStep > 4;

  const [pri, sec, ter] = char.abilityPriority;
  const validPriority = pri && sec && ter &&
    new Set([pri, sec, ter]).size === 3 &&
    ABIL_CATEGORY_NAMES.includes(pri as AbilityGroup) &&
    ABIL_CATEGORY_NAMES.includes(sec as AbilityGroup) &&
    ABIL_CATEGORY_NAMES.includes(ter as AbilityGroup);

  if (!validPriority) {
    issues.push(
      "Set ability priority first: " +
        "+chargen/priority abilities=talents/skills/knowledges",
    );
    return { step: 4, complete: false, issues, remaining };
  }

  const alloc: Record<string, number> = {
    [pri]: ABIL_ALLOC.primary,
    [sec]: ABIL_ALLOC.secondary,
    [ter]: ABIL_ALLOC.tertiary,
  };

  for (const group of ABIL_CATEGORY_NAMES) {
    const budget = alloc[group];
    const abils = ABILITY_GROUPS[group as AbilityGroup];
    const spent = abils.reduce((sum, a) => sum + (char.abilities[a] ?? 0), 0);
    const rem = budget - spent;
    remaining[`${group}Dots`] = pastStep ? Math.min(0, rem) : rem;
    if (!pastStep) {
      if (rem < 0) issues.push(`${group} has ${-rem} too many dots`);
      if (rem > 0) {
        issues.push(
          `${group} needs ${rem} more dot${rem === 1 ? "" : "s"}`,
        );
      }
    }
  }

  // Soft max 3 only while ON step 4; freebies may raise later.
  for (const [abil, dots] of Object.entries(char.abilities)) {
    if (!pastStep && dots > 3) {
      issues.push(
        `${abil} exceeds max of 3 during Step 4 ` +
          `(use freebies in Step 6 to go higher)`,
      );
    }
    if (dots > 5) issues.push(`${abil} exceeds absolute max of 5`);
  }

  // Specialty validation
  for (const [abil, spec] of Object.entries(char.abilitySpecialties)) {
    if (spec) {
      const dots = char.abilities[abil] ?? 0;
      const isOverride = (SPECIALTY_OVERRIDE_LIST as readonly string[])
        .includes(abil);
      if (dots < 4 && !isOverride) {
        issues.push(
          `${abil} specialty requires value >= 4 (currently ${dots})`,
        );
      }
    }
  }

  return { step: 4, complete: issues.length === 0, issues, remaining };
}

// -- Step 5 -- Advantages ----------------------------------------------------
// Past Step 5, freebies may buy more background dots (over the step pool).

function validateStep5(char: IWoDChar): IStepBudget {
  const issues: string[] = [];
  const remaining: Record<string, number> = {};
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  const pastStep = char.chargenStep > 5;

  // Backgrounds
  const bgTotal = Object.values(char.backgrounds).reduce((s, v) => s + v, 0);
  const bgBudget = splat?.backgroundDots ?? 5;
  remaining.backgroundDots = pastStep
    ? Math.min(0, bgBudget - bgTotal)
    : bgBudget - bgTotal;
  if (!pastStep && bgTotal > bgBudget) {
    issues.push(
      `Background total ${bgTotal} exceeds limit of ${bgBudget}`,
    );
  }
  if (bgTotal < bgBudget) {
    issues.push(
      `Assign ${bgBudget - bgTotal} more background dot` +
        `${bgBudget - bgTotal === 1 ? "" : "s"}`,
    );
  }

  // Tribe restrictions
  if (ext && char.tribe) {
    const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
    if (tribeDef) {
      for (const bg of tribeDef.backgroundRestrictions.restricted) {
        if ((char.backgrounds[bg] ?? 0) > 1) {
          issues.push(`${bg} is restricted for ${tribeDef.displayName} -- max 1 dot without staff exception`);
        }
      }
      for (const req of tribeDef.backgroundRestrictions.required ?? []) {
        if ((char.backgrounds[req.name] ?? 0) < req.minDots) {
          issues.push(`${tribeDef.displayName} requires ${req.name} >= ${req.minDots} dots`);
        }
      }
    }
  }

  // WtA gifts
  if (char.splat === "wta" && ext) {
    const gifts = char.gifts ?? [];
    if (gifts.length !== 3) {
      issues.push(`Select 3 gifts (breed, auspice, tribe) -- have ${gifts.length}`);
      remaining.giftsNeeded = 3 - gifts.length;
    } else {
      const breedDef = ext.breeds?.find((b) => b.id === char.breed);
      const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
      const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
      const giftData = ext.gifts;

      if (breedDef && !breedDef.beginningGifts.includes(gifts[0])) {
        issues.push(`"${gifts[0]}" is not a valid breed gift for ${breedDef.name}`);
      }
      if (auspiceDef && !auspiceDef.beginningGifts.includes(gifts[1])) {
        issues.push(`"${gifts[1]}" is not a valid auspice gift for ${auspiceDef.name}`);
      }
      if (tribeDef && !tribeDef.beginningGifts.includes(gifts[2])) {
        issues.push(`"${gifts[2]}" is not a valid tribe gift for ${tribeDef.displayName}`);
      }
      // Verify all gifts exist in the gift table
      for (const g of gifts) {
        const key = g.toLowerCase();
        if (giftData && !giftData[key]) {
          issues.push(`Unknown gift "${g}"`);
        }
      }
    }

    // Renown
    if (!char.renown) {
      issues.push("Assign starting renown");
    } else {
      const auspiceDef = ext.auspices?.find((a) => a.id === char.auspice);
      if (auspiceDef) {
        const total = char.renown.glory + char.renown.honor + char.renown.wisdom;
        const expected = auspiceDef.beginningRenown.glory +
          auspiceDef.beginningRenown.honor +
          auspiceDef.beginningRenown.wisdom;
        if (auspiceDef.renownFlex) {
          if (total !== 1) issues.push(`Ragabash renown must total 1 (have ${total})`);
        } else {
          if (char.renown.glory !== auspiceDef.beginningRenown.glory) {
            issues.push(`Glory must be ${auspiceDef.beginningRenown.glory} for ${auspiceDef.name}`);
          }
          if (char.renown.honor !== auspiceDef.beginningRenown.honor) {
            issues.push(`Honor must be ${auspiceDef.beginningRenown.honor} for ${auspiceDef.name}`);
          }
          if (char.renown.wisdom !== auspiceDef.beginningRenown.wisdom) {
            issues.push(`Wisdom must be ${auspiceDef.beginningRenown.wisdom} for ${auspiceDef.name}`);
          }
        }
      }
    }

    // Metis deformity re-check
    if (char.breed === "metis" && !char.deformity?.trim()) {
      issues.push("Metis requires a deformity");
    }
  }

  return { step: 5, complete: issues.length === 0, issues, remaining };
}

// -- Step 6 -- Freebies ------------------------------------------------------
// Incomplete until the freebie bank is empty OR the player confirms with
// +chargen/done. Leftover freebies are allowed after explicit confirm.

function validateStep6(char: IWoDChar): IStepBudget {
  const issues: string[] = [];
  const remaining: Record<string, number> = {};

  const fb = char.freebiesRemaining ?? 0;
  remaining.freebies = fb;

  if (fb < 0) {
    issues.push(`Overspent ${-fb} freebie points`);
  } else if (fb > 0 && !char.freebiesDone) {
    issues.push(
      `${fb} freebie point${fb === 1 ? "" : "s"} left -- ` +
        `+chargen/spend <trait>=n, or +chargen/done to finish`,
    );
  }

  // Cap checks after freebies
  for (const [attr, extra] of Object.entries(char.attributes)) {
    if ((ATTR_BASE + extra) > 5) {
      issues.push(`${attr} exceeds max of 5`);
    }
  }
  for (const [abil, dots] of Object.entries(char.abilities)) {
    if (dots > 5) issues.push(`${abil} exceeds max of 5`);
  }

  // Re-check Silver Fangs requirement after freebies
  const splat = SplatRegistry.get(char.splat);
  const ext = splat?.ext as IWtaSplatExt | undefined;
  if (ext && char.tribe) {
    const tribeDef = ext.tribes?.find((t) => t.id === char.tribe);
    for (const req of tribeDef?.backgroundRestrictions?.required ?? []) {
      if ((char.backgrounds[req.name] ?? 0) < req.minDots) {
        issues.push(
          `${tribeDef!.displayName} requires ${req.name} >= ${req.minDots}`,
        );
      }
    }
  }

  return {
    step: 6,
    complete: issues.length === 0,
    issues,
    remaining,
  };
}

// -- Freebie cost calculator ------------------------------------------------

/** Calculate the freebie cost for adding `dots` to a named trait. */
export function freebiesCost(
  splat: ISplat,
  traitField: string,
  dots: number,
): number {
  const ft = splat.freebieTable;
  if (traitField.startsWith("attributes.")) return ft.attribute * dots;
  if (traitField.startsWith("abilities."))  return ft.ability   * dots;
  if (traitField.startsWith("backgrounds."))return ft.background * dots;
  if (traitField.startsWith("gifts."))      return (ft.gift ?? 7) * dots;
  if (traitField.startsWith("disciplines.")) return (ft.discipline ?? 7) * dots;
  if (traitField.startsWith("virtues."))    return (ft.virtue ?? 2) * dots;
  if (traitField === "humanity")            return (ft.humanity ?? 1) * dots;
  if (traitField === "rage")                return (ft.rage ?? 1) * dots;
  if (traitField === "gnosis")              return (ft.gnosis ?? 2) * dots;
  if (traitField === "willpower")           return ft.willpower * dots;
  return 0;
}
