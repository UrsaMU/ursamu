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
import { matchNameOrThrow } from "../support/match.ts";

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
export function updateCgState(
  cgState: CofdCgState,
  trait: string,
  val: string,
): CofdCgState {
  const stage = cgState.stage;
  let sheet = JSON.parse(JSON.stringify(cgState.sheet)) as CofdSheet;
  let key = trait.toLowerCase().trim();
  // Canonical key after partial-name resolve (attrs/skills/powers).
  let resolvedTrait = trait;

  const tKey = sheet.template.toLowerCase().trim();
  const tmpl = COFD_TEMPLATES[tKey] || COFD_TEMPLATES.mortal;

  // 1. Stage checks (+ partial name resolve where catalogs apply)
  switch (stage) {
    case 1:
      if (!["concept", "virtue", "vice"].includes(key)) {
        throw new Error(
          "In Stage 1, you can only set concept, virtue, and vice.",
        );
      }
      break;

    case 2:
      if (key !== "template") {
        throw new Error(
          "In Stage 2, you can only set template " +
            "(e.g. +cg/set template=changeling).",
        );
      }
      break;

    case 3: {
      if (!tmpl.customFields.includes(key)) {
        throw new Error(
          `In Stage 3, you can only set custom fields for ` +
            `'${tmpl.name}': ${tmpl.customFields.join(", ")}.`,
        );
      }
      // Canonical catalogs (seeming, kith, court, auspice, tribe)
      // normalize casing; free-form fields pass through.
      const res = resolveCustomFieldValue(
        sheet.template,
        key,
        val,
      );
      if (res.kind === "invalid") throw new Error(res.error);
      if (res.kind === "ok") val = res.value;
      break;
    }

    case 4: {
      const matched = matchNameOrThrow(
        key,
        COFD_ATTRIBUTES,
        "attribute",
      );
      key = matched.toLowerCase();
      resolvedTrait = matched;
      break;
    }

    case 5: {
      const matched = matchNameOrThrow(
        key,
        COFD_SKILLS,
        "skill",
      );
      key = matched.toLowerCase();
      resolvedTrait = matched;
      break;
    }

    case 6: {
      // Merits may be qualified ("language(spanish)"). Match on
      // the merit portion; allow partial / stop-word-tolerant names
      // ("body as a weapon" → "body as weapon").
      const meritRef = parseMeritRef(key);
      const meritKeys = COFD_MERITS.map((m) => m.key);
      const matchedMerit = matchNameOrThrow(
        meritRef.merit,
        meritKeys,
        "merit",
        "+cg/list merits",
      );
      const q = meritRef.qualifier;
      resolvedTrait = q
        ? `${matchedMerit}(${q})`
        : matchedMerit;
      key = resolvedTrait.toLowerCase();
      break;
    }

    case 7: {
      // Changeling Stage 7 uses +cg/contract, not +cg/set.
      if (sheet.template === "changeling") {
        throw new Error(
          "In Stage 7, choose Contracts with " +
            "+cg/contract <name>, +cg/uncontract <name>. " +
            "Browse with +cg/list contracts.",
        );
      }
      const matched = matchNameOrThrow(
        key,
        tmpl.validPowers,
        "power",
      );
      key = matched.toLowerCase();
      resolvedTrait = matched;
      break;
    }

    case 8:
      // Stage 8 (Werewolf Gifts & Rites) uses discrete verbs.
      throw new Error(
        "In Stage 8, choose Gifts and Rites with " +
          "+cg/gift <facet>, +cg/rite <rite> " +
          "(and /ungift, /unrite).",
      );

    default:
      throw new Error(
        `Invalid character generation stage: ${stage}.`,
      );
  }

  // 2. Validate and set via standardized engine helpers
  const validatedValue = validateTraitValue(
    resolvedTrait,
    val,
    sheet,
  );

  // Chargen caps: attributes, skills, powers <= 5
  if (typeof validatedValue === "number") {
    const v = validatedValue;
    if (COFD_ATTRIBUTES.includes(key) && (v < 1 || v > 5)) {
      throw new Error(
        "During character generation, attributes must " +
          "be between 1 and 5.",
      );
    }
    if (COFD_SKILLS.includes(key) && (v < 0 || v > 5)) {
      throw new Error(
        "During character generation, skills must " +
          "be between 0 and 5.",
      );
    }
    if (tmpl.validPowers.includes(key) && (v < 0 || v > 5)) {
      throw new Error(
        "During character generation, powers must " +
          "be between 0 and 5.",
      );
    }
  }

  sheet = setTrait(sheet, resolvedTrait, validatedValue);

  return {
    ...cgState,
    sheet,
  };
}
