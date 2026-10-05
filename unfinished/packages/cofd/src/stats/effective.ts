// Effective trait resolution: base sheet value, overridden by tempStats
// when a scene/form buff is active. Combat, Defense, Health max, and
// the roller all read through these helpers so form shifts stay consistent.

import type { CofdAttribute, CofdSkill } from "../dictionary/index.ts";
import type { CofdSheet } from "./sheet.ts";

/**
 * Effective attribute dots. `tempStats` holds absolute effective values
 * (not deltas); when present and numeric, they win over base.
 */
export function effectiveAttr(
  sheet: CofdSheet,
  name: string,
): number {
  const key = name.toLowerCase().trim();
  const temp = sheet.tempStats?.[key];
  if (typeof temp === "number" && Number.isFinite(temp)) {
    return Math.max(0, Math.floor(temp));
  }
  const base = (sheet.attributes as Record<string, number>)[key];
  return typeof base === "number" ? base : 1;
}

/**
 * Effective skill dots. Same absolute-override convention as attributes.
 * Untrained penalty is applied by callers (roller), not here.
 */
export function effectiveSkill(
  sheet: CofdSheet,
  name: string,
): number {
  const key = name.toLowerCase().trim();
  const temp = sheet.tempStats?.[key];
  if (typeof temp === "number" && Number.isFinite(temp)) {
    return Math.max(0, Math.floor(temp));
  }
  const base = (sheet.skills as Record<string, number>)[key];
  return typeof base === "number" ? base : 0;
}

/** Effective Size (advantages.size, overridable via tempStats.size). */
export function effectiveSize(sheet: CofdSheet): number {
  const temp = sheet.tempStats?.size;
  if (typeof temp === "number" && Number.isFinite(temp)) {
    return Math.max(1, Math.floor(temp));
  }
  return sheet.advantages?.size ?? 5;
}

/**
 * Base Speed = Str + Dex + factor. Human factor 5; animal forms use
 * catalog speedFactor via tempStats.speed when set, else form lookup
 * is applied by effectiveSpeed in form/senses.ts.
 */
export function effectiveSpeedBase(
  sheet: CofdSheet,
  speedFactor: number = 5,
): number {
  return effectiveAttr(sheet, "strength") +
    effectiveAttr(sheet, "dexterity") +
    speedFactor;
}

/** Typed convenience for attribute keys. */
export function effectiveAttribute(
  sheet: CofdSheet,
  name: CofdAttribute,
): number {
  return effectiveAttr(sheet, name);
}

/** Typed convenience for skill keys. */
export function effectiveSkillTyped(
  sheet: CofdSheet,
  name: CofdSkill,
): number {
  return effectiveSkill(sheet, name);
}
