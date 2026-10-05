// Mien flags and free scene-end Mask restore.

import type { CofdSheet } from "../stats/sheet.ts";
import { isChangelingSheet } from "./mask.ts";

const ANIMAL_TEMP_KEYS = [
  "strength",
  "dexterity",
  "stamina",
  "size",
  "speed",
] as const;

function clearFormTempStats(sheet: CofdSheet): Record<string, number> {
  const next = { ...(sheet.tempStats ?? {}) };
  const keys = sheet.formState?.tempKeys ?? [...ANIMAL_TEMP_KEYS];
  for (const k of keys) delete next[k];
  return next;
}

export function isMienActive(sheet: CofdSheet): boolean {
  const fs = sheet.formState;
  if (!fs) return false;
  if (fs.system === "mask" && fs.current === "mien") return true;
  if (fs.system === "animal" && fs.priorMask === "mien") return true;
  return false;
}

/** For future +contract: exceptional while Mask down. */
export function contractExceptionalActive(sheet: CofdSheet): boolean {
  return isChangelingSheet(sheet) && isMienActive(sheet);
}

/** Free Mask raise / leave animal at combat end. */
export function restoreMaskAtSceneEnd(
  sheet: CofdSheet,
  now: number = Date.now(),
): CofdSheet | null {
  if (!isChangelingSheet(sheet)) return null;
  const fs = sheet.formState;
  const needs =
    (fs?.system === "mask" && fs.current === "mien") ||
    fs?.system === "animal";
  if (!needs) return null;
  return {
    ...sheet,
    tempStats: clearFormTempStats(sheet),
    formState: {
      system: "mask",
      current: "mask",
      since: now,
      source: "scene-end",
      tempKeys: [],
    },
  };
}
