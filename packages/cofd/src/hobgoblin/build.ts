// Build hobgoblin sheets (CtL p.252+ light).

import { defaultSheet, type CofdSheet } from "../stats/index.ts";

export type HobConcept =
  | "trickster"
  | "merchant"
  | "predator"
  | "guardian"
  | "crafter"
  | "custom";

export interface BuildHobOpts {
  name: string;
  concept?: HobConcept;
  wyrd?: number;
  aspiration?: string;
  frailty?: string;
  dreadPowers?: string[];
}

const SAFE_POWERS: Record<HobConcept, string[]> = {
  trickster: ["innocuous", "mortal-mask"],
  merchant: ["innocuous", "mind-speech"],
  predator: ["frenzy", "regeneration"],
  guardian: ["regeneration", "wall-crawl"],
  crafter: ["telekinesis"],
  custom: ["innocuous"],
};

/**
 * Create a hobgoblin template sheet with Wyrd, Glamour, Dread Powers.
 */
export function buildHobgoblinSheet(
  opts: BuildHobOpts,
): CofdSheet {
  const concept = opts.concept ?? "trickster";
  const wyrd = Math.max(1, Math.min(10, opts.wyrd ?? 2));
  let sheet = defaultSheet();
  sheet.template = "hobgoblin";
  sheet.powerStatValue = wyrd;
  sheet.moralityValue = Math.max(3, 8 - wyrd);
  sheet.energyCurrent = Math.max(10, wyrd * 5);
  sheet.concept = opts.name;
  sheet.customFields = {
    concept,
    aspiration: opts.aspiration ?? "Strike a clever bargain",
  };
  if (opts.frailty) {
    sheet.frailties = [opts.frailty];
  } else {
    sheet.frailties = ["bane: cold iron", "taboo: never refuse a fair deal"];
  }
  // Light attribute spreads by concept
  if (concept === "predator") {
    sheet.attributes.strength = 3;
    sheet.attributes.dexterity = 3;
    sheet.attributes.wits = 3;
    sheet.skills.brawl = 3;
    sheet.skills.stealth = 2;
    sheet.skills.intimidation = 2;
  } else if (concept === "merchant") {
    sheet.attributes.manipulation = 4;
    sheet.attributes.presence = 3;
    sheet.skills.persuasion = 3;
    sheet.skills.subterfuge = 3;
    sheet.skills.empathy = 2;
  } else if (concept === "guardian") {
    sheet.attributes.stamina = 4;
    sheet.attributes.resolve = 3;
    sheet.skills.weaponry = 2;
    sheet.skills.athletics = 2;
  } else {
    sheet.attributes.wits = 3;
    sheet.attributes.manipulation = 3;
    sheet.skills.subterfuge = 2;
    sheet.skills.larceny = 2;
    sheet.skills.stealth = 2;
  }
  const powers = opts.dreadPowers?.length
    ? opts.dreadPowers
    : SAFE_POWERS[concept] ?? SAFE_POWERS.custom;
  sheet = {
    ...sheet,
    hobgoblinState: {
      concept,
      dreadPowers: powers,
      aspiration: sheet.customFields.aspiration,
    },
  };
  return sheet;
}

export function isHobgoblinSheet(sheet: CofdSheet): boolean {
  return (sheet.template ?? "").toLowerCase() === "hobgoblin";
}

export function readHobPowers(sheet: CofdSheet): string[] {
  const h = sheet.hobgoblinState as { dreadPowers?: string[] } | undefined;
  return Array.isArray(h?.dreadPowers) ? [...h!.dreadPowers!] : [];
}
