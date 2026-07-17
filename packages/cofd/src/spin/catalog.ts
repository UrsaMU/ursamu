// Hedgespinning effect catalog lookup.

import {
  SPIN_EFFECTS,
  type SpinEffect,
  type SpinEffectDef,
} from "./types.ts";

export function listSpinEffects(): readonly SpinEffectDef[] {
  return SPIN_EFFECTS;
}

export function findSpinEffect(
  slugOrName: string,
): SpinEffectDef | null {
  const q = slugOrName.toLowerCase().trim();
  return (
    SPIN_EFFECTS.find(
      (e) =>
        e.slug === q ||
        e.name.toLowerCase() === q ||
        e.name.toLowerCase().includes(q),
    ) ?? null
  );
}

export function isSpinEffect(s: string): s is SpinEffect {
  return SPIN_EFFECTS.some((e) => e.slug === s);
}
