// Animal-form sense / movement helpers for rolls and sheet display.

import type { CofdSheet } from "../stats/sheet.ts";
import { currentAnimal } from "./animals.ts";
import { effectiveAttr } from "../stats/effective.ts";

/**
 * Base Speed = Str + Dex + speedFactor.
 * Prefer tempStats.speed when animal form wrote it; else recompute.
 */
export function effectiveSpeed(sheet: CofdSheet): number {
  const temp = sheet.tempStats?.speed;
  if (typeof temp === "number" && Number.isFinite(temp)) {
    return Math.max(0, Math.floor(temp));
  }
  const animal = currentAnimal(sheet);
  const factor = animal?.speedFactor ?? 5;
  const str = effectiveAttr(sheet, "strength");
  const dex = effectiveAttr(sheet, "dexterity");
  return str + dex + factor;
}

/**
 * Perception dice bonus while in animal form with sensory tags.
 * +2 if any of scent, low-light, keen-sight.
 */
export function animalPerceptionBonus(sheet: CofdSheet): number {
  const animal = currentAnimal(sheet);
  if (!animal) return 0;
  const tags = new Set(animal.senses.map((s) => s.toLowerCase()));
  if (
    tags.has("scent") ||
    tags.has("low-light") ||
    tags.has("keen-sight")
  ) {
    return 2;
  }
  return 0;
}

/**
 * True when the roll expression is a Perception-style pool
 * (Wits+Composure, or tokens perception / perceive).
 */
export function isPerceptionRoll(expr: string): boolean {
  const e = expr.toLowerCase().replace(/\s+/g, "");
  if (e.includes("perception") || e.includes("perceive")) return true;
  // Wits+Composure in either order, optional extras after.
  if (/wits\+composure/.test(e) || /composure\+wits/.test(e)) {
    return true;
  }
  return false;
}

export function animalMovementLine(sheet: CofdSheet): string {
  const animal = currentAnimal(sheet);
  if (!animal?.movement.length) return "";
  return animal.movement.join(", ");
}

export function animalSensesLine(sheet: CofdSheet): string {
  const animal = currentAnimal(sheet);
  if (!animal?.senses.length) return "";
  return animal.senses.join(", ");
}
