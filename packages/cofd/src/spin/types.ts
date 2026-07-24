// Hedgespinning — reshape the Hedge (CtL 2e Subtle + Paradigm).

/** Catalog effects players can attempt. */
export type SpinEffect =
  | "path"
  | "shelter"
  | "barrier"
  | "veil"
  | "fruit"
  | "trap"
  | "equipment"
  | "armor"
  | "weapon"
  | "guide"
  | "tilt"
  | "edge"
  | "terrain"
  | "goblin-fruit"
  | "env-tilt"
  | "scenery"
  | "danger-step";

export type SpinKind = "subtle" | "paradigm";

export interface SpinEffectDef {
  slug: SpinEffect;
  name: string;
  kind: SpinKind;
  /** Glamour cost to attempt. */
  glamour: number;
  /**
   * Successes that must be spent from the roll to buy this effect
   * (book cost table). Target = this value for the resolve check.
   */
  target: number;
  description: string;
  /** Requires room realm hedge or hollow. */
  needsHedge: boolean;
  book: string;
}

export interface SpinResult {
  ok: boolean;
  reason?: string;
  sheet?: import("../stats/sheet.ts").CofdSheet;
  effect?: SpinEffectDef;
  successes?: number;
  exceptional?: boolean;
  lines: string[];
  /** Room data patches for caller to apply. */
  roomPatch?: Record<string, unknown>;
  /** Spawn fruit slug on success (fruit effect). */
  fruitSlug?: string;
  /** Nav flag key applied on path success. */
  navBonusKey?: string;
  /** Hedge contested the paradigm shift. */
  hedgeContested?: boolean;
  hedgeSuccesses?: number;
}
