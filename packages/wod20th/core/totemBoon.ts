// core/totemBoon.ts -- pack totem boon invocation helper.
//
// Boons are free-form strings curated on the pack record. Activation costs
// 1 Gnosis and is available to ANY pack member regardless of splat (kinfolk
// included). The frenzy gate is enforced by the caller; this helper performs
// only the pure spend computation.
import type { IWoDChar } from "./types.ts";
import { spendPool } from "./pools.ts";

/** Lowercase-hyphenated slug for a totem boon string. */
export function boonSlug(boon: string): string {
  return boon.toLowerCase().trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Match a user-supplied slug against a list of totem-boon strings. */
export function findBoonInList(boons: string[] | undefined, slug: string): string | null {
  if (!boons || boons.length === 0) return null;
  const want = boonSlug(slug);
  for (const b of boons) {
    if (boonSlug(b) === want) return b;
  }
  return null;
}

/**
 * Apply a totem boon spend (1 Gnosis flat). Mutates `char.gnosisCurrent`.
 * Returns `{ ok: true }` on success or `{ ok: false, message }` on shortfall.
 *
 * Single spendPool call: the helper is pure (no mutation), so one resolve
 * is sufficient. The mutation lands here, in the local commit assignment.
 */
export function applyTotemBoonSpend(
  char: IWoDChar,
): { ok: boolean; message: string } {
  const res = spendPool(char, "gnosis", 1);
  if (!res.ok) return { ok: false, message: res.message };
  char.gnosisCurrent = res.remaining;
  return { ok: true, message: "Spent 1 Gnosis." };
}
