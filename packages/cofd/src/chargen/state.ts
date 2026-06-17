// Character generation state shape, initialization, and per-stage trait updates.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
  parseMeritRef,
  findSeeming,
  findKith,
  findCourt,
  findRegalia,
  findAuspice,
  findTribe,
  CTL_SEEMING_NAMES,
  CTL_COURT_NAMES,
  CTL_REGALIA_NAMES,
  WTF_AUSPICE_NAMES,
  WTF_TRIBE_NAMES,
} from "../dictionary/index.ts";
import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  defaultSheet,
  setTrait,
  validateTraitValue,
  type CofdSheet,
} from "../stats/index.ts";

export interface CofdCgState {
  stage: number;        // 1 to 6
  sheet: CofdSheet;
  isSubmitted: boolean;
  isApproved: boolean;
  submittedJob?: number;
  submittedAt?: number;
}

export function initCgState(): CofdCgState {
  return {
    stage: 1,
    sheet: defaultSheet(),
    isSubmitted: false,
    isApproved: false,
  };
}

/** Starting Merit dots for a template. Werewolf gets 10; all others 7. */
export function startingMeritDots(template: string): number {
  return template.toLowerCase().trim() === "werewolf" ? 10 : 7;
}

/**
 * Starting Stage-7 power dots for a template (Contracts for Changeling,
 * Renown for Werewolf). Ghost Wolves begin with one fewer Renown dot.
 */
export function startingPowerDots(template: string, tribe?: string): number {
  const t = template.toLowerCase().trim();
  if (t === "changeling") return 3;
  if (t === "werewolf") {
    return (tribe || "").trim().toLowerCase() === "ghost wolves" ? 2 : 3;
  }
  return 0;
}

/** Human label for a template's Stage-7 powers. */
export function powerLabel(template: string): string {
  const t = template.toLowerCase().trim();
  if (t === "changeling") return "Contracts";
  if (t === "werewolf") return "Renown";
  return "Powers";
}

/**
 * Final chargen stage for a template. Mortals end at 6 (no powers); templates
 * with a power group add Stage 7; Werewolf additionally adds Stage 8 (Gifts &
 * Rites).
 */
export function maxStageFor(template: string): number {
  const t = template.toLowerCase().trim();
  if (t === "werewolf") return 8;
  // Changeling's Stage 7 is discrete Contract selection (validPowers is empty),
  // so it can't be inferred from validPowers.length.
  if (t === "changeling") return 7;
  const tmpl = COFD_TEMPLATES[t];
  return tmpl && tmpl.validPowers.length > 0 ? 7 : 6;
}

// Stage-3 custom fields that have a canonical catalog. Anything not listed here
// (concept, needle, thread, blood, bone, ...) is genuinely free-form text.
interface CustomFieldDomain {
  find: (v: string) => { name: string } | null;
  options: string;
}

const CUSTOM_FIELD_DOMAINS: Record<string, Record<string, CustomFieldDomain>> = {
  changeling: {
    seeming: { find: findSeeming, options: `Valid seemings: ${CTL_SEEMING_NAMES.join(", ")}.` },
    kith:    { find: findKith,    options: "See +cg/list kiths for valid kiths." },
    court:   { find: findCourt,   options: `Valid courts: ${CTL_COURT_NAMES.join(", ")}.` },
    favored: { find: findRegalia, options: `Valid Regalia: ${CTL_REGALIA_NAMES.join(", ")}.` },
  },
  werewolf: {
    auspice: { find: findAuspice, options: `Valid auspices: ${WTF_AUSPICE_NAMES.join(", ")}.` },
    tribe:   { find: findTribe,   options: `Valid tribes: ${WTF_TRIBE_NAMES.join(", ")}.` },
  },
};

export type CustomFieldResolution =
  | { kind: "free" }                    // no canonical list — accept as typed
  | { kind: "ok"; value: string }       // valid — `value` is the canonical-cased name
  | { kind: "invalid"; error: string }; // not a recognized value

/**
 * Resolve a Stage-3 custom field value against its canonical catalog, if any.
 * Free-form fields pass through; recognized fields are normalized to canonical
 * casing; unrecognized values are rejected with a helpful list.
 */
export function resolveCustomFieldValue(
  template: string,
  field: string,
  value: string,
): CustomFieldResolution {
  const domain = CUSTOM_FIELD_DOMAINS[template.toLowerCase().trim()]?.[field.toLowerCase().trim()];
  if (!domain) return { kind: "free" };
  const found = domain.find(value);
  if (found) return { kind: "ok", value: found.name };
  return { kind: "invalid", error: `Invalid ${field} '${value}'. ${domain.options}` };
}

export function getStageName(stage: number): string {
  switch (stage) {
    case 1: return "Concept & Anchors";
    case 2: return "Template";
    case 3: return "Template Details";
    case 4: return "Attributes";
    case 5: return "Skills";
    case 6: return "Merits";
    case 7: return "Powers";
    case 8: return "Gifts & Rites";
    default: return "Unknown";
  }
}

/**
 * Updates traits specific to the current creation stage.
 */
export function updateCgState(cgState: CofdCgState, trait: string, val: string): CofdCgState {
  const stage = cgState.stage;
  let sheet = JSON.parse(JSON.stringify(cgState.sheet)) as CofdSheet;
  const key = trait.toLowerCase().trim();

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  // 1. Stage-specific trait check
  switch (stage) {
    case 1:
      if (!["concept", "virtue", "vice"].includes(key)) {
        throw new Error("In Stage 1, you can only set concept, virtue, and vice.");
      }
      break;

    case 2:
      if (key !== "template") {
        throw new Error("In Stage 2, you can only set template (e.g. +cg/set template=changeling).");
      }
      break;

    case 3: {
      if (!tmpl.customFields.includes(key)) {
        throw new Error(`In Stage 3, you can only set custom fields for '${tmpl.name}': ${tmpl.customFields.join(", ")}.`);
      }
      // Fields with a canonical catalog (seeming, kith, court, auspice, tribe)
      // must match a real value; recognized values are normalized to canonical
      // casing. Free-form fields (needle, thread, blood, bone) pass through.
      const res = resolveCustomFieldValue(sheet.template, key, val);
      if (res.kind === "invalid") throw new Error(res.error);
      if (res.kind === "ok") val = res.value;
      break;
    }

    case 4:
      if (!COFD_ATTRIBUTES.includes(key)) {
        throw new Error(`In Stage 4, you can only set attributes: ${COFD_ATTRIBUTES.join(", ")}.`);
      }
      break;

    case 5:
      if (!COFD_SKILLS.includes(key)) {
        throw new Error(`In Stage 5, you can only set skills: ${COFD_SKILLS.join(", ")}.`);
      }
      break;

    case 6: {
      // Merits may be qualified ("language(spanish)"). Match on the merit
      // portion of the key, not the full storage key.
      const meritRef = parseMeritRef(key);
      const meritDef = COFD_MERITS.find(m => m.key === meritRef.merit);
      if (!meritDef) {
        throw new Error("In Stage 6, you can only allocate merits.");
      }
      break;
    }

    case 7: {
      // Changeling Stage 7 is discrete Contract selection via +cg/contract.
      if (sheet.template === "changeling") {
        throw new Error("In Stage 7, choose Contracts with +cg/contract <name>, +cg/uncontract <name>. Browse with +cg/list contracts.");
      }
      const isPower = tmpl.validPowers.includes(key);
      if (!isPower) {
        throw new Error(`In Stage 7, you can only allocate starting powers (${tmpl.validPowers.join(", ")}).`);
      }
      break;
    }

    case 8:
      // Stage 8 (Werewolf Gifts & Rites) uses discrete +cg/gift and +cg/rite
      // verbs, not +cg/set.
      throw new Error("In Stage 8, choose Gifts and Rites with +cg/gift <facet>, +cg/rite <rite> (and /ungift, /unrite).");

    default:
      throw new Error(`Invalid character generation stage: ${stage}.`);
  }

  // 2. Validate and set value using our standardized engine functions
  const validatedValue = validateTraitValue(trait, val, sheet);

  // Enforce chargen-specific caps (attributes, skills, powers <= 5)
  if (typeof validatedValue === "number") {
    if (COFD_ATTRIBUTES.includes(key) && (validatedValue < 1 || validatedValue > 5)) {
      throw new Error("During character generation, attributes must be between 1 and 5.");
    }
    if (COFD_SKILLS.includes(key) && (validatedValue < 0 || validatedValue > 5)) {
      throw new Error("During character generation, skills must be between 0 and 5.");
    }
    if (tmpl.validPowers.includes(key) && (validatedValue < 0 || validatedValue > 5)) {
      throw new Error("During character generation, powers must be between 0 and 5.");
    }
  }

  sheet = setTrait(sheet, trait, validatedValue);

  return {
    ...cgState,
    sheet,
  };
}
