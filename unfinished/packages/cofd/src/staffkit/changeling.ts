// Minimal changeling kit for staff playtesting locks.

import { COFD_TEMPLATES } from "../gamelines/templates.ts";
import {
  defaultSheet,
  refreshAdvantages,
  type CofdSheet,
} from "../stats/index.ts";
import type { StaffKitResult } from "./types.ts";

/**
 * Build a playable staff changeling sheet.
 * Enough to pass isChangelingSheet, Glamour spends, hedge gates,
 * and fae sight — not a full chargen character.
 */
export function buildChangelingKit(): StaffKitResult {
  let sheet: CofdSheet = defaultSheet();
  sheet.template = "changeling";
  sheet.concept = "Staff test Lost";
  sheet.virtue = "Hope";
  sheet.vice = "Curiosity";
  sheet.customFields = {
    seeming: "Darkling",
    kith: "Whisperwisp",
    court: "Autumn",
    needle: "Survivor",
    thread: "Friendship",
    mask: "A pale clerk in a damp coat",
    mien: "Moth-dust and too-long fingers",
    favored: "Stealth",
  };
  sheet.attributes = {
    ...sheet.attributes,
    intelligence: 2,
    wits: 3,
    resolve: 2,
    strength: 2,
    dexterity: 2,
    stamina: 2,
    presence: 2,
    manipulation: 2,
    composure: 3,
  };
  sheet.skills = {
    ...sheet.skills,
    athletics: 1,
    stealth: 2,
    survival: 2,
    investigation: 1,
    occult: 2,
    empathy: 1,
    persuasion: 1,
    subterfuge: 2,
  };
  sheet.specialties = {
    occult: ["Hedge"],
    survival: ["Urban"],
  };
  sheet.powerStatValue = 1;
  sheet.moralityValue = 7;
  sheet.contracts = [];
  sheet.frailties = [];
  sheet.formState = { system: "mask", current: "mask" };
  sheet.merits = { hollow: 1 };
  sheet = refreshAdvantages(sheet);
  const tmpl = COFD_TEMPLATES.changeling ?? COFD_TEMPLATES.mortal;
  sheet.energyCurrent = tmpl.energyMaxFormula(sheet.powerStatValue);

  return {
    splat: "changeling",
    label: "Changeling (Lost)",
    sheet,
    flags: ["approved", "fae"],
    unlocks:
      "fae sight, +hedge, +harvest, +shift mask/mien, " +
      "+contract, +ic (approved)",
  };
}
