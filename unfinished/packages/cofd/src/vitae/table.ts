// Blood Potency / Vitae pool tables (VtR 2e).

import data from "../../resources/vampire.json" with { type: "json" };

export interface BpRow {
  readonly bp: number;
  readonly vitaeMax: number;
  readonly perTurn: number;
  readonly feed: string;
}

const ROWS: readonly BpRow[] = Object.freeze(
  (data.bloodPotency as BpRow[]).map((r) => Object.freeze({ ...r })),
);

export function clampBp(bp: number): number {
  return Math.max(0, Math.min(10, Math.floor(bp)));
}

export function bpRow(bp: number): BpRow {
  const n = clampBp(bp);
  return ROWS.find((r) => r.bp === n) ?? ROWS[1]!;
}

/** Max Vitae pool for Blood Potency (VtR table; BP 10 = 75). */
export function vitaeMaxForBp(bp: number): number {
  return bpRow(bp).vitaeMax;
}

/** Vitae spendable per turn at this BP. */
export function vitaePerTurn(bp: number): number {
  return bpRow(bp).perTurn;
}

/**
 * Humanity breaking-point rating modifier (VtR 2e).
 * Differs from core Integrity: 6–7 is 0, not +1.
 */
export function humanityModifier(humanity: number): number {
  const h = Math.max(0, Math.min(10, Math.floor(humanity)));
  if (h >= 8) return 2;
  if (h >= 6) return 0;
  if (h >= 4) return -1;
  if (h >= 2) return -2;
  return -3;
}
