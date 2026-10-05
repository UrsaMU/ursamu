// Specified-target tilt thresholds for CoFD 2e combat (core p.92).
//
// This module is purely a threshold calculator -- it returns tilt KEY strings
// that the caller is responsible for applying via the tilts subsystem.
// It does NOT import from src/subsystems/tilts.ts to avoid circular coupling.

import type { AttackOptions } from "./modifiers.ts";

/**
 * Check which tilts should be applied based on the location targeted and the
 * net damage that landed (after armor).
 *
 * @param net       Net damage boxes landed after armor (>= 0).
 * @param stamina   Target's Stamina attribute.
 * @param size      Target's Size (default 5 for humans).
 * @param specified The specified target location, or undefined.
 * @returns         Array of tilt key strings to apply (may be empty).
 */
export function checkSpecifiedTargetTilts(
  net: number,
  stamina: number,
  size: number,
  specified: AttackOptions["specified"],
): string[] {
  if (!specified || net <= 0) return [];

  const result: string[] = [];

  switch (specified) {
    case "arm":
    case "hand":
      // Arm Wrack if net damage > Stamina.
      if (net > stamina) {
        result.push("arm-wrack");
      }
      break;

    case "leg":
      // Leg Wrack if net damage > Stamina.
      if (net > stamina) {
        result.push("leg-wrack");
      }
      break;

    case "head":
      // Stunned if net damage >= Size.
      if (net >= size) {
        result.push("stunned");
      }
      break;

    case "eye":
      // Blinded whenever any net damage lands (threshold already guarded above).
      result.push("blinded");
      break;

    case "heart":
      // Not a standard tilt. Log as a special note for vampire / supernatural
      // systems to detect. We return a synthetic key that supernatural
      // subsystems can filter on.
      result.push("heart-strike");
      break;

    case "torso":
      // No special tilt from a torso hit.
      break;
  }

  return result;
}
