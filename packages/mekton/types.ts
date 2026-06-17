// Local interface definitions for types not yet in @ursamu/ursamu v2.x.
// Structurally compatible with ai-gm IGameSystem.

export interface IStatSystem {
  name: string;
  version: string;
  getCategories(): string[];
  getStats(category?: string): string[];
  getStat(actor: Record<string, unknown>, stat: string): unknown;
  setStat(actor: Record<string, unknown>, stat: string, value: unknown): Promise<void>;
  validate(stat: string, value: unknown): boolean | string;
}

export interface IMoveThresholds {
  fullSuccess: number;
  partialSuccess: number;
}

export interface IGameSystem extends IStatSystem {
  id: string;
  coreRulesPrompt: string;
  moveThresholds: IMoveThresholds;
  stats: readonly string[];
  formatMoveResult(moveName: string, stat: string, total: number, roll: [number, number]): string;
  formatCharacterContext(sheet: Record<string, unknown>): string;
  adjudicationHint: string;
  hardMoves: readonly string[];
  softMoves: readonly string[];
  missConsequenceHint: string;
  source: "bundled" | "ingested";
  ingestedFrom?: string[];
  charCollection?: string;
}
