// Hedgespinning — reshape the Hedge (CtL 2e, simplified).

/** Catalog effects players can attempt. */
export type SpinEffect =
  | "path"
  | "shelter"
  | "barrier"
  | "veil"
  | "fruit"
  | "trap";

export interface SpinEffectDef {
  slug: SpinEffect;
  name: string;
  /** Glamour cost. */
  glamour: number;
  /** Target successes (extended-style single roll). */
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
}

export const SPIN_EFFECTS: readonly SpinEffectDef[] = [
  {
    slug: "path",
    name: "Carve a Path",
    glamour: 1,
    target: 2,
    description:
      "Open a clearer way. Next +hedge/travel gains +2.",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
  {
    slug: "shelter",
    name: "Raise Shelter",
    glamour: 2,
    target: 3,
    description:
      "Shape cover. Room danger softens toward trod (ST).",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
  {
    slug: "barrier",
    name: "Thorn Barrier",
    glamour: 2,
    target: 3,
    description:
      "Wall of thorns. Block a direction (RP / ST).",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
  {
    slug: "veil",
    name: "Veil the Glade",
    glamour: 1,
    target: 2,
    description:
      "Mask room flavor for a scene (maskFlavor set).",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
  {
    slug: "fruit",
    name: "Coax Fruit",
    glamour: 2,
    target: 3,
    description:
      "Wring a common goblin fruit from the thorns.",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
  {
    slug: "trap",
    name: "Snare",
    glamour: 2,
    target: 3,
    description:
      "Lay a snare. Next foe may take Ambushed (ST).",
    needsHedge: true,
    book: "CtL Hedgespinning",
  },
];
