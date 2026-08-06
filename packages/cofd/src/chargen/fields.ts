// Catalog resolution for Stage-3 custom fields and Stage-7 powers.
// Kept separate from state.ts so stats/validate can import without cycles.

import {
  findSeeming,
  findKith,
  findCourt,
  findRegalia,
  findAuspice,
  findTribe,
  findClan,
  findCovenant,
  CTL_SEEMING_NAMES,
  CTL_KITHS,
  CTL_COURT_NAMES,
  CTL_REGALIA_NAMES,
  WTF_AUSPICE_NAMES,
  WTF_TRIBE_NAMES,
  VTR_CLAN_NAMES,
  VTR_COVENANT_NAMES,
  VTR_DISCIPLINE_NAMES,
} from "../dictionary/index.ts";
import { matchNameOrThrow } from "../support/match.ts";

interface CustomFieldDomain {
  find: (v: string) => { name: string } | null;
  names: readonly string[];
  hint: string;
}

const CTL_KITH_NAMES = Object.freeze(
  CTL_KITHS.map((k) => k.name),
);

const CUSTOM_FIELD_DOMAINS: Record<
  string,
  Record<string, CustomFieldDomain>
> = {
  changeling: {
    seeming: {
      find: findSeeming,
      names: CTL_SEEMING_NAMES,
      hint: "+cg/list seemings",
    },
    kith: {
      find: findKith,
      names: CTL_KITH_NAMES,
      hint: "+cg/list kiths",
    },
    court: {
      find: findCourt,
      names: CTL_COURT_NAMES,
      hint: "+cg/list courts",
    },
    favored: {
      find: findRegalia,
      names: CTL_REGALIA_NAMES,
      hint: "+cg/list regalia",
    },
  },
  werewolf: {
    auspice: {
      find: findAuspice,
      names: WTF_AUSPICE_NAMES,
      hint: "+cg/list auspices",
    },
    tribe: {
      find: findTribe,
      names: WTF_TRIBE_NAMES,
      hint: "+cg/list tribes",
    },
  },
  vampire: {
    clan: {
      find: findClan,
      names: VTR_CLAN_NAMES,
      hint: "+cg/list clans",
    },
    covenant: {
      find: findCovenant,
      names: VTR_COVENANT_NAMES,
      hint: "+cg/list covenants",
    },
  },
};

/** Vampire Stage-3 fields that are optional free-form prose. */
export const VAMPIRE_OPTIONAL_FIELDS = new Set(["bloodline"]);

/** Display labels for awkward custom-field keys. */
export function customFieldLabel(field: string): string {
  const f = field.toLowerCase().trim();
  if (f === "touchstonemask") return "Mask Touchstone";
  if (f === "touchstonedirge") return "Dirge Touchstone";
  if (f === "favored") return "Second Favored Regalia";
  return field.replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Legacy `touchstone` → mask touchstone. Accept hyphenated aliases.
 */
export function normalizeCustomFieldKey(key: string): string {
  const k = key.toLowerCase().trim();
  if (
    k === "touchstone" ||
    k === "touchstone-mask" ||
    k === "mask-touchstone" ||
    k === "masktouchstone"
  ) {
    return "touchstonemask";
  }
  if (
    k === "touchstone-dirge" ||
    k === "dirge-touchstone" ||
    k === "dirgetouchstone"
  ) {
    return "touchstonedirge";
  }
  return k;
}

export type CustomFieldResolution =
  | { kind: "free" }
  | { kind: "ok"; value: string }
  | { kind: "invalid"; error: string };

/**
 * Resolve a catalog custom field with partial-name matching
 * (same UX as attributes / skills / merits).
 */
export function resolveCustomFieldValue(
  template: string,
  field: string,
  value: string,
): CustomFieldResolution {
  const domain = CUSTOM_FIELD_DOMAINS[
    template.toLowerCase().trim()
  ]?.[normalizeCustomFieldKey(field)];
  if (!domain) return { kind: "free" };
  const exact = domain.find(value);
  if (exact) return { kind: "ok", value: exact.name };
  try {
    const matched = matchNameOrThrow(
      value,
      domain.names,
      field,
      domain.hint,
    );
    const again = domain.find(matched);
    if (again) return { kind: "ok", value: again.name };
    return { kind: "ok", value: matched };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { kind: "invalid", error: msg };
  }
}

/** Canonical Discipline / power key for Stage 7 (partial OK). */
export function resolvePowerKey(
  query: string,
  validPowers: readonly string[],
  template: string,
): string {
  const t = template.toLowerCase().trim();
  const label = t === "vampire"
    ? "discipline"
    : t === "werewolf"
    ? "renown"
    : "power";
  const hint = t === "vampire"
    ? "+cg/list disciplines"
    : undefined;
  const pool = t === "vampire" && VTR_DISCIPLINE_NAMES.length
    ? VTR_DISCIPLINE_NAMES
    : validPowers;
  const matched = matchNameOrThrow(query, pool, label, hint);
  return matched.toLowerCase();
}
