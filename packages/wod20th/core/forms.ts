// core/forms.ts -- WtA shapeshifter form definitions and modifiers.
//
// Pure functions only -- no DB writes, no SDK references. The +shift command
// (commands/shift.ts) is responsible for persistence and hook emission.
//
// M20 canonical table:
//
//   Form    | Str | Dex | Sta | Man | App
//   --------|-----|-----|-----|-----|-----
//   Homid   |  +0 |  +0 |  +0 |  +0 |  +0
//   Glabro  |  +2 |  +0 |  +2 |  -1 |  -1
//   Crinos  |  +4 |  +1 |  +3 |  -3 |   0  (Appearance forced to 0 to non-Garou)
//   Hispo   |  +3 |  +2 |  +3 |  -3 |   0
//   Lupus   |  +1 |  +2 |  +2 |  -3 |   0

import type { IWoDChar } from "./types.ts";
import { isFrenzied } from "./frenzy.ts";

/** The five Werewolf forms, breed-form-first ordering for display. */
export type Form = "homid" | "glabro" | "crinos" | "hispo" | "lupus";

/** Canonical ordered list of all five forms. */
export const FORM_LIST: readonly Form[] = ["homid", "glabro", "crinos", "hispo", "lupus"];

/** Attribute keys affected by form shifts. */
export const FORM_ATTRS: readonly string[] = [
  "Strength", "Dexterity", "Stamina", "Manipulation", "Appearance",
];

/**
 * Static modifiers applied to permanent attributes per form.
 * Appearance in Crinos/Hispo/Lupus is canonically 0 (not negative); we model
 * this as a "set to zero" rule rather than a delta. See applyFormModifiers().
 */
export const FORM_MODIFIERS: Record<Form, Record<string, number>> = {
  homid:  { Strength:  0, Dexterity: 0, Stamina: 0, Manipulation:  0, Appearance:  0 },
  glabro: { Strength:  2, Dexterity: 0, Stamina: 2, Manipulation: -1, Appearance: -1 },
  crinos: { Strength:  4, Dexterity: 1, Stamina: 3, Manipulation: -3, Appearance:  0 },
  hispo:  { Strength:  3, Dexterity: 2, Stamina: 3, Manipulation: -3, Appearance:  0 },
  lupus:  { Strength:  1, Dexterity: 2, Stamina: 2, Manipulation: -3, Appearance:  0 },
};

/** Forms where Appearance is forced to 0 regardless of permanent rating. */
const APPEARANCE_ZERO: ReadonlySet<Form> = new Set(["crinos", "hispo", "lupus"]);

/**
 * Return the default natural form for a given breed.
 * - homid -> homid
 * - lupus -> lupus
 * - metis -> crinos (canonical; metis are born in the in-between form)
 * Anything else falls back to homid.
 */
export function defaultFormForBreed(breed: string | undefined): Form {
  switch ((breed ?? "").toLowerCase()) {
    case "homid": return "homid";
    case "lupus": return "lupus";
    case "metis": return "crinos";
    default:      return "homid";
  }
}

/**
 * Return a copy of the character's attribute map with the active form's
 * modifiers applied to Str/Dex/Sta/Man/App. Does NOT mutate the input.
 * Results are clamped to [1, 10]. Appearance in Crinos/Hispo/Lupus is forced
 * to 0 per the M20 rule (Garou are uncanny to non-Garou in war/wolf forms).
 */
export function applyFormModifiers(char: IWoDChar): Record<string, number> {
  const out: Record<string, number> = { ...char.attributes };
  const form: Form = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;
  const mods = FORM_MODIFIERS[form];
  if (!mods) return out;

  for (const attr of FORM_ATTRS) {
    // Attributes are stored as extra dots above a base of 1.
    const perm = 1 + (char.attributes[attr] ?? 0);
    let val: number;
    if (attr === "Appearance" && APPEARANCE_ZERO.has(form)) {
      val = 0;
    } else {
      val = perm + (mods[attr] ?? 0);
      if (val < 1)  val = 1;
      if (val > 10) val = 10;
    }
    out[attr] = val;
  }
  return out;
}

/**
 * Pure validation for a shift request.
 * - Confirms the actor is a WtA character.
 * - Confirms the target is one of the five canonical forms.
 *
 * The full Stamina + Primal Urge roll is intentionally out of scope here;
 * see Stage 4 follow-up. Returns ok=true on a clean validation.
 */
export function shiftTo(
  char: IWoDChar,
  target: string,
  now: number = Date.now(),
): { ok: boolean; message: string } {
  if (char.splat !== "wta") {
    return { ok: false, message: "Only Garou (WtA) characters can shift forms." };
  }
  const t = (target ?? "").toLowerCase().trim() as Form;
  if (!FORM_LIST.includes(t)) {
    return {
      ok: false,
      message: `Unknown form '${target}'. Valid: ${FORM_LIST.join(", ")}.`,
    };
  }
  const current: Form = (char.currentForm ?? defaultFormForBreed(char.breed)) as Form;
  if (current === t) {
    return { ok: false, message: `You are already in ${t} form.` };
  }
  // Frenzy forces Crinos: a frenzied Garou may shift INTO Crinos but cannot
  // shift OUT of it until the frenzy ends. Berserk and fox frenzy both apply.
  if (isFrenzied(char, now) && current === "crinos" && t !== "crinos") {
    return {
      ok: false,
      message: "Frenzy locks you in Crinos -- you cannot shift out until it ends.",
    };
  }
  return { ok: true, message: `You shift from ${current} to ${t}.` };
}
