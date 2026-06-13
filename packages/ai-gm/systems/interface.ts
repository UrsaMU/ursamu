import type { ICharSheet } from "../context/loader.ts";

export interface IStatSystem {
  name: string;
  version: string;
  getCategories(): string[];
  getStats(category?: string): string[];
  getStat(actor: Record<string, unknown>, stat: string): unknown;
  setStat(
    actor: Record<string, unknown>,
    stat: string,
    value: unknown,
  ): Promise<void>;
  validate(stat: string, value: unknown): boolean | string;
}

// ─── IGameSystem — swappable RPG system knowledge ────────────────────────────
//
// Extends IStatSystem (ursamu v1.5.7) with GM-specific fields.
// Implement this to teach the GM a new game system — no code changes needed
// for ingested systems; they are stored as JSON in server.gm.custom_systems.
//
// Switch active system with: +gm/config/system <systemId>

export interface IMoveThresholds {
  fullSuccess: number; // 10+ in Urban Shadows
  partialSuccess: number; // 7–9
  // below partialSuccess = miss (GM hard move + mark XP)
}

export interface IGameSystem extends IStatSystem {
  // IStatSystem provides: name, version, getCategories, getStats,
  //   getStat, setStat, validate

  id: string; // "urban-shadows"

  // Core rules injected verbatim into the GM system prompt
  coreRulesPrompt: string;

  // Move adjudication thresholds
  moveThresholds: IMoveThresholds;

  // Stat names for this system (used for validation + display)
  stats: readonly string[];

  // Format a move result line for the LLM context
  formatMoveResult(
    moveName: string,
    stat: string,
    total: number,
    roll: [number, number],
  ): string;

  // Format a character sheet as a GM context block
  formatCharacterContext(sheet: ICharSheet): string;

  // Fiction-first principle for this system
  adjudicationHint: string;

  // Hard MC move palette (examples seeded into every prompt)
  hardMoves: readonly string[];

  // Soft MC move palette
  softMoves: readonly string[];

  // What a "miss" means in this system (injected into move adjudication prompt)
  missConsequenceHint: string;

  // Source metadata
  source: "bundled" | "ingested";
  ingestedFrom?: string[];
  confidence?: Record<string, "high" | "uncertain">;

  // DBO collection holding character sheets for this system.
  // Undefined = use the value from IGMConfig.charCollection (or "server.playbooks").
  charCollection?: string;
}
