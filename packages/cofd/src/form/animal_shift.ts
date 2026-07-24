// Enter / leave Chrysalis animal body via tempStats.

import type { CofdSheet } from "../stats/sheet.ts";
import {
  findAnimal,
  hasChrysalis,
  maxAnimalSize,
  unlockedAnimals,
  type AnimalForm,
} from "./animals.ts";
import { isChangelingSheet } from "./mask.ts";
import type { FormState } from "./types.ts";

const ANIMAL_TEMP_KEYS = [
  "strength",
  "dexterity",
  "stamina",
  "size",
  "speed",
] as const;

export interface AnimalShiftResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  from?: string;
  to?: string;
  glamourSpent?: number;
  message?: string;
}

function currentFormKey(sheet: CofdSheet): string {
  const fs = sheet.formState;
  if (!fs || fs.system === "none" || !fs.current) return "mask";
  return fs.current || "mask";
}

function priorMask(sheet: CofdSheet): "mask" | "mien" {
  const fs = sheet.formState;
  if (fs?.system === "animal" && fs.priorMask) return fs.priorMask;
  if (fs?.system === "mask" && fs.current === "mien") return "mien";
  return "mask";
}

function clearFormTempStats(sheet: CofdSheet): Record<string, number> {
  const next = { ...(sheet.tempStats ?? {}) };
  const keys = sheet.formState?.tempKeys ?? [...ANIMAL_TEMP_KEYS];
  for (const k of keys) delete next[k];
  return next;
}

function applyAnimalTemps(
  sheet: CofdSheet,
  animal: AnimalForm,
): Record<string, number> {
  const next = clearFormTempStats(sheet);
  next.strength = animal.strength;
  next.dexterity = animal.dexterity;
  next.stamina = animal.stamina;
  next.size = animal.size;
  // Stored so sheet/combat can read speed without catalog re-lookup.
  next.speed = animal.strength + animal.dexterity + animal.speedFactor;
  return next;
}

function leaveAnimal(
  sheet: CofdSheet,
  key: string,
  now: number,
): AnimalShiftResult {
  if (sheet.formState?.system !== "animal") {
    return { ok: false, reason: "You are not in animal form." };
  }
  const restore: "mask" | "mien" =
    key === "mien" ? "mien" : key === "mask" ? "mask" : priorMask(sheet);
  return {
    ok: true,
    sheet: {
      ...sheet,
      tempStats: clearFormTempStats(sheet),
      formState: {
        system: "mask",
        current: restore,
        since: now,
        source: "core-mask",
        tempKeys: [],
      },
    },
    from: currentFormKey(sheet),
    to: restore,
    glamourSpent: 0,
    message: restore === "mien"
      ? "Flesh returns; your Mask stays down."
      : "Flesh returns; you wear the Mask again.",
  };
}

function enterAnimal(
  sheet: CofdSheet,
  key: string,
  now: number,
): AnimalShiftResult {
  if (!hasChrysalis(sheet)) {
    return { ok: false, reason: "You need the Chrysalis Contract." };
  }
  const animal = findAnimal(key);
  if (!animal) {
    return {
      ok: false,
      reason: `Unknown animal '${key}'. +shift/list animals`,
    };
  }
  if (!unlockedAnimals(sheet).includes(animal.slug)) {
    return {
      ok: false,
      reason: `Animal '${animal.slug}' not on your list. ` +
        `+sheet/set animals=<slug,slug>`,
    };
  }
  const maxSz = maxAnimalSize(sheet.customFields?.seeming);
  if (animal.size > maxSz) {
    return {
      ok: false,
      reason: `Size ${animal.size} exceeds limit (${maxSz}).`,
    };
  }
  if (
    sheet.formState?.system === "animal" &&
    sheet.formState.current === animal.slug
  ) {
    return { ok: false, reason: `Already in ${animal.name} form.` };
  }
  const cost = 2;
  const glamour = sheet.energyCurrent ?? 0;
  if (glamour < cost) {
    return {
      ok: false,
      reason: `Not enough Glamour (need ${cost}, have ${glamour}).`,
    };
  }

  const formState: FormState = {
    system: "animal",
    current: animal.slug,
    since: now,
    source: "chrysalis",
    tempKeys: [...ANIMAL_TEMP_KEYS],
    priorMask: priorMask(sheet),
  };

  const bits: string[] = [];
  if (animal.senses.length) {
    bits.push(`Senses: ${animal.senses.join(", ")}`);
  }
  if (animal.movement.length) {
    bits.push(`Move: ${animal.movement.join(", ")}`);
  }
  const extra = bits.length ? `. ${bits.join(". ")}.` : ".";

  return {
    ok: true,
    sheet: {
      ...sheet,
      energyCurrent: glamour - cost,
      tempStats: applyAnimalTemps(sheet, animal),
      formState,
    },
    from: currentFormKey(sheet),
    to: animal.slug,
    glamourSpent: cost,
    message: `Chrysalis: ${animal.name} (Size ${animal.size})${extra}`,
  };
}

/** Enter animal (2 Glamour) or leave (human/mask/mien). */
export function applyAnimalShift(
  sheet: CofdSheet,
  target: string,
  now: number = Date.now(),
): AnimalShiftResult {
  if (!isChangelingSheet(sheet)) {
    return { ok: false, reason: "Only changelings use Chrysalis." };
  }
  const key = target.toLowerCase().trim();
  if (!key) {
    return { ok: false, reason: "Name an animal form or human." };
  }
  if (key === "human" || key === "mask" || key === "mien") {
    return leaveAnimal(sheet, key, now);
  }
  return enterAnimal(sheet, key, now);
}
