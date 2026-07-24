// Mantle / Court Goodwill merit helpers (CtL 2e).

import type { CofdSheet } from "../stats/sheet.ts";

/** Dots in Mantle for a court (storage key mantle:<court>). */
export function mantleDots(
  sheet: CofdSheet,
  court?: string,
): number {
  const c = (court ?? sheet.customFields?.court ?? "")
    .toLowerCase()
    .trim();
  if (!c) return 0;
  const m = sheet.merits ?? {};
  return Math.max(
    0,
    m[`mantle:${c}`] ?? m[`mantle (${c})`] ?? 0,
  );
}

/** Court Goodwill dots for a court. */
export function goodwillDots(
  sheet: CofdSheet,
  court: string,
): number {
  const c = court.toLowerCase().trim();
  if (!c) return 0;
  const m = sheet.merits ?? {};
  return Math.max(
    0,
    m[`court goodwill:${c}`] ??
      m[`court-goodwill:${c}`] ??
      0,
  );
}

/** Own-court Mantle (for dice pools listing "Mantle"). */
export function ownMantle(sheet: CofdSheet): number {
  return mantleDots(sheet);
}

/** Acute Senses: +Wyrd on perception rolls (Merit). */
export function acuteSensesBonus(sheet: CofdSheet): number {
  const dots = sheet.merits?.["acute senses"] ?? 0;
  if (dots < 1) return 0;
  return Math.max(0, sheet.powerStatValue || 0);
}

/** Pandemoniacal: bonus dice to Incite Bedlam. */
export function pandemoniacalBonus(sheet: CofdSheet): number {
  return Math.max(0, sheet.merits?.pandemoniacal ?? 0);
}

/** Stable Trod rating (motley Merit). */
export function stableTrodDots(sheet: CofdSheet): number {
  return Math.max(0, sheet.merits?.["stable trod"] ?? 0);
}
