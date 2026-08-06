// Character generation state shape, initialization, and per-stage trait updates.

import {
  COFD_ATTRIBUTES,
  COFD_SKILLS,
  COFD_MERITS,
  parseMeritRef,
  findMaskDirge,
  VTR_MASK_DIRGE_NAMES,
} from "../dictionary/index.ts";
import {
  COFD_TEMPLATES,
  chargenTemplates,
  isChargenTemplate,
} from "../gamelines/templates.ts";
import {
  defaultSheet,
  setTrait,
  validateTraitValue,
  type CofdSheet,
} from "../stats/index.ts";
import { matchNameOrThrow } from "../support/match.ts";
import {
  VAMPIRE_OPTIONAL_FIELDS,
  customFieldLabel,
  normalizeCustomFieldKey,
  resolveCustomFieldValue,
  resolvePowerKey,
  type CustomFieldResolution,
} from "./fields.ts";

export {
  VAMPIRE_OPTIONAL_FIELDS,
  customFieldLabel,
  normalizeCustomFieldKey,
  resolveCustomFieldValue,
  resolvePowerKey,
  type CustomFieldResolution,
};

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

/** Starting Merit dots. Vampire & Werewolf get 10; others 7. */
export function startingMeritDots(template: string): number {
  const t = template.toLowerCase().trim();
  if (t === "werewolf" || t === "vampire") return 10;
  return 7;
}

/**
 * Starting Stage-7 power dots for a template (Contracts for Changeling,
 * Renown for Werewolf). Ghost Wolves begin with one fewer Renown dot.
 */
export function startingPowerDots(template: string, tribe?: string): number {
  const t = template.toLowerCase().trim();
  if (t === "changeling") return 3;
  if (t === "vampire") return 3;
  if (t === "werewolf") {
    return (tribe || "").trim().toLowerCase() === "ghost wolves" ? 2 : 3;
  }
  return 0;
}

/** Human label for a template's Stage-7 powers. */
export function powerLabel(template: string): string {
  const t = template.toLowerCase().trim();
  if (t === "changeling") return "Contracts";
  if (t === "vampire") return "Disciplines";
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
  // Changeling Stage 7 = discrete Contracts; Vampire Stage 7 = Disciplines.
  if (t === "changeling" || t === "vampire") return 7;
  const tmpl = COFD_TEMPLATES[t];
  return tmpl && tmpl.validPowers.length > 0 ? 7 : 6;
}

/**
 * Stage-1 anchor keys. Vampires store Mask/Dirge on virtue/vice;
 * mask/dirge are accepted aliases that write those same fields.
 */
export function stage1AnchorKeys(template: string): string[] {
  const t = template.toLowerCase().trim();
  if (t === "vampire") {
    return ["concept", "virtue", "vice", "mask", "dirge"];
  }
  return ["concept", "virtue", "vice"];
}

/** Map Stage-1 alias keys onto the sheet property they write. */
export function resolveStage1Key(key: string): string {
  const k = key.toLowerCase().trim();
  if (k === "mask") return "virtue";
  if (k === "dirge") return "vice";
  return k;
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
    case 1: {
      const allowed = stage1AnchorKeys(sheet.template);
      if (!allowed.includes(key)) {
        throw new Error(
          `In Stage 1, you can only set ${allowed.join(", ")}.`,
        );
      }
      // Vampire: mask/dirge are aliases for virtue/vice sheet fields.
      key = resolveStage1Key(key);
      resolvedTrait = key;
      break;
    }

    case 2:
      if (key !== "template") {
        throw new Error(
          "In Stage 2, you can only set template " +
            "(e.g. +cg/set template=changeling).",
        );
      }
      {
        const want = val.toLowerCase().trim();
        if (!isChargenTemplate(want)) {
          const open = chargenTemplates()
            .map((t) => t.key)
            .join(", ");
          throw new Error(
            `'${val}' is not open for chargen right now. ` +
              `Available: ${open}.`,
          );
        }
      }
      break;

    case 3: {
      // Vampire: Mask/Dirge archetypes may be set here too.
      if (
        tKey === "vampire" &&
        (key === "mask" || key === "dirge" ||
          key === "virtue" || key === "vice")
      ) {
        key = resolveStage1Key(key);
        resolvedTrait = key;
        // Partial match Mask/Dirge archetypes.
        if (key === "virtue" || key === "vice") {
          const m = findMaskDirge(val) ?? (() => {
            try {
              const n = matchNameOrThrow(
                val,
                VTR_MASK_DIRGE_NAMES,
                key === "virtue" ? "mask" : "dirge",
                "+cg/list masks",
              );
              return findMaskDirge(n);
            } catch {
              return null;
            }
          })();
          if (m) val = m.name;
        }
        break;
      }
      key = normalizeCustomFieldKey(key);
      resolvedTrait = key;
      const allowed = tmpl.customFields.map((f) =>
        f.toLowerCase()
      );
      if (!allowed.includes(key)) {
        const extra = tKey === "vampire"
          ? ", mask, dirge"
          : "";
        throw new Error(
          `In Stage 3, you can only set custom fields for ` +
            `'${tmpl.name}': ` +
            `${tmpl.customFields.join(", ")}${extra}.`,
        );
      }
      // Catalog fields: partial-name autocomplete; free-form pass.
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
      key = resolvePowerKey(
        key,
        tmpl.validPowers,
        sheet.template,
      );
      resolvedTrait = key;
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

  // Keep sheet.touchstones in sync with Stage-3 touchstone fields.
  const rk = resolvedTrait.toLowerCase();
  if (rk === "touchstonemask" || rk === "touchstonedirge") {
    const ts = { ...(sheet.touchstones ?? {}) };
    if (rk === "touchstonemask") {
      ts.mask = String(validatedValue);
    } else {
      ts.dirge = String(validatedValue);
    }
    sheet.touchstones = ts;
  }

  return {
    ...cgState,
    sheet,
  };
}
