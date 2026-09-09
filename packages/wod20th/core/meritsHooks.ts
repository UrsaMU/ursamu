// core/meritsHooks.ts -- Mechanical hooks for VtM merits/flaws.

import type { IWoDChar } from "./types.ts";

function hasMerit(char: IWoDChar, name: string): boolean {
  const m = char.merits ?? {};
  const q = name.toLowerCase();
  return Object.keys(m).some((k) => k.toLowerCase() === q && (m[k] ?? 0) > 0);
}

function hasFlaw(char: IWoDChar, name: string): boolean {
  const f = char.flaws ?? {};
  const q = name.toLowerCase();
  return Object.keys(f).some((k) => k.toLowerCase() === q && (f[k] ?? 0) > 0);
}

/** Unbondable: immune to blood bonds. */
export function isUnbondable(char: IWoDChar): boolean {
  return hasMerit(char, "Unbondable");
}

/**
 * Prey Exclusion: refuse a class of vessel (stored in powerFlags or notes).
 * Uses flaw presence + optional powerFlags.preyExclusion string.
 */
export function preyExclusionBlock(
  char: IWoDChar,
  vesselLabel: string,
): string | null {
  if (!hasFlaw(char, "Prey Exclusion")) return null;
  const excl = String(char.powerFlags?.preyExclusion ?? "").trim();
  if (!excl) return null; // ST hasn't set the class yet
  if (vesselLabel.toLowerCase().includes(excl.toLowerCase())) {
    return (
      `Prey Exclusion: you refuse to feed on "${excl}" ` +
      `(${vesselLabel}).`
    );
  }
  return null;
}

/** Deep Sleeper: harder to awaken (informational + flag). */
export function isDeepSleeper(char: IWoDChar): boolean {
  return hasFlaw(char, "Deep Sleeper");
}

/** Natural Leader: +2 Leadership dice (caller adds when rolling Leadership). */
export function leadershipBonus(char: IWoDChar): number {
  return hasMerit(char, "Natural Leader") ? 2 : 0;
}

/** Acute Sense: +2 on rolls for the chosen sense (flag acuteSense). */
export function acuteSenseBonus(char: IWoDChar, sense?: string): number {
  if (!hasMerit(char, "Acute Sense")) return 0;
  if (!sense) return 2;
  const chosen = String(char.powerFlags?.acuteSense ?? "").toLowerCase();
  if (!chosen || chosen === sense.toLowerCase()) return 2;
  return 0;
}

/** Ambidextrous: no off-hand penalty (combat callers check). */
export function isAmbidextrous(char: IWoDChar): boolean {
  return hasMerit(char, "Ambidextrous");
}

/** Enemy flaw: returns true if present (ST plots). */
export function hasEnemy(char: IWoDChar): boolean {
  return hasFlaw(char, "Enemy");
}

export function meritFlawSummary(char: IWoDChar): string[] {
  const lines: string[] = [];
  const merits = char.merits ?? {};
  const flaws = char.flaws ?? {};
  for (const [k, v] of Object.entries(merits)) {
    if (v > 0) lines.push(`  Merit: ${k} (${v})`);
  }
  for (const [k, v] of Object.entries(flaws)) {
    if (v > 0) lines.push(`  Flaw:  ${k} (${v})`);
  }
  return lines;
}

export { hasMerit, hasFlaw };
