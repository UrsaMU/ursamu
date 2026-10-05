// Hedgeway key phrases (mortal / shared open).

import type { Hedgeway } from "./types.ts";

/** Normalize for compare: trim, collapse space, lower. */
export function normalizeKeyPhrase(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

export function wayHasKey(way: Hedgeway): boolean {
  return Boolean(way.keyPhrase && way.keyPhrase.trim());
}

/**
 * True when spoken phrase matches the gate key.
 * Empty spoken never matches a set key.
 */
export function keyPhraseMatches(
  way: Hedgeway,
  spoken: string,
): boolean {
  if (!wayHasKey(way)) return false;
  const a = normalizeKeyPhrase(way.keyPhrase!);
  const b = normalizeKeyPhrase(spoken);
  return a.length > 0 && a === b;
}

/**
 * Can this actor use the key path (skip Lost Glamour open)?
 * Anyone who speaks the correct key may open/enter.
 */
export function canOpenWithKey(
  way: Hedgeway,
  spoken: string | undefined,
): boolean {
  if (!spoken || !spoken.trim()) return false;
  return keyPhraseMatches(way, spoken);
}
