// V20 generation chart -- blood pool, spend/turn, trait max.
// Source: V20 character sheet / systems (Ch. 3 / Ch. 6).
import type { IGenerationRow } from "../../../core/types.ts";

export const VTM_GENERATION_TABLE: readonly IGenerationRow[] = [
  { generation: 4, bloodMax: 50, bloodPerTurn: 10, traitMax: 9 },
  { generation: 5, bloodMax: 40, bloodPerTurn: 8, traitMax: 8 },
  { generation: 6, bloodMax: 30, bloodPerTurn: 6, traitMax: 7 },
  { generation: 7, bloodMax: 20, bloodPerTurn: 4, traitMax: 6 },
  { generation: 8, bloodMax: 15, bloodPerTurn: 3, traitMax: 5 },
  { generation: 9, bloodMax: 14, bloodPerTurn: 2, traitMax: 5 },
  { generation: 10, bloodMax: 13, bloodPerTurn: 1, traitMax: 5 },
  { generation: 11, bloodMax: 12, bloodPerTurn: 1, traitMax: 5 },
  { generation: 12, bloodMax: 11, bloodPerTurn: 1, traitMax: 5 },
  { generation: 13, bloodMax: 10, bloodPerTurn: 1, traitMax: 5 },
  { generation: 14, bloodMax: 10, bloodPerTurn: 1, traitMax: 5 },
  { generation: 15, bloodMax: 8, bloodPerTurn: 1, traitMax: 5 },
];

/** Background Generation dots -> generation number (base 13). */
export function generationFromBgDots(dots: number): number {
  const d = Math.max(0, Math.min(5, Math.floor(dots)));
  return 13 - d;
}

export function generationRow(
  gen: number,
): IGenerationRow {
  const row = VTM_GENERATION_TABLE.find((r) => r.generation === gen);
  return row ?? VTM_GENERATION_TABLE.find((r) => r.generation === 13)!;
}

export function applyGenerationPools(
  generation: number,
): { bloodMax: number; bloodPerTurn: number; traitMax: number } {
  const row = generationRow(generation);
  return {
    bloodMax: row.bloodMax,
    bloodPerTurn: row.bloodPerTurn,
    traitMax: row.traitMax,
  };
}
