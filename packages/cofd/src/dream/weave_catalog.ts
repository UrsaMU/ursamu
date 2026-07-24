// Dreamweave catalog — subtle + paradigm (CtL p.218–219).

import type { WeaveDef } from "./types.ts";

export type WeaveKind = "subtle" | "paradigm";

export interface WeaveDefFull extends WeaveDef {
  kind: WeaveKind;
  /** Apply this condition key on success (optional). */
  applyCondition?: string;
  /** Apply this tilt key on success. */
  applyTilt?: string;
  /** Clear these condition keys (calm). */
  clearConditions?: string[];
}

export const WEAVE_CATALOG: readonly WeaveDefFull[] = [
  // —— Subtle ——
  {
    slug: "memory",
    name: "Unearth Memory",
    kind: "subtle",
    glamour: 1,
    target: 2,
    description: "Guide dream toward a repressed memory (ST).",
    book: "CtL Subtle",
  },
  {
    slug: "secret",
    name: "Whisper Secret",
    kind: "subtle",
    glamour: 1,
    target: 2,
    description: "Learn one true detail about the dreamer.",
    book: "CtL Subtle",
  },
  {
    slug: "calm",
    name: "Soothe Nightmare",
    kind: "subtle",
    glamour: 1,
    target: 1,
    description: "Ease fear; clear Frightened/Spooked on dreamer.",
    book: "CtL Subtle",
    clearConditions: ["frightened", "spooked"],
  },
  {
    slug: "fright",
    name: "Deepen Fear",
    kind: "subtle",
    glamour: 1,
    target: 2,
    description: "Intensify nightmare; inflict Frightened.",
    book: "CtL Subtle",
    applyCondition: "frightened",
  },
  {
    slug: "prop",
    name: "Shape Prop",
    kind: "subtle",
    glamour: 1,
    target: 1,
    description: "Prop equipment bonus = successes (max +5).",
    book: "CtL Subtle",
  },
  {
    slug: "role",
    name: "Claim Role",
    kind: "subtle",
    glamour: 0,
    target: 1,
    description: "Adopt a role that fits the dream scene.",
    book: "CtL Playing a Role",
  },
  {
    slug: "exit",
    name: "Find the Exit",
    kind: "subtle",
    glamour: 1,
    target: 3,
    description: "Locate Bastion exit; wake uncontested.",
    book: "CtL Bastions",
  },
  {
    slug: "path",
    name: "Dreaming Path",
    kind: "subtle",
    glamour: 2,
    target: 2,
    description: "Reveal one Road exit from this node (nav cue).",
    book: "CtL Dreaming Roads",
  },
  {
    slug: "equip",
    name: "Dream Tool",
    kind: "subtle",
    glamour: 1,
    target: 1,
    description: "Equipment bonus on next roll (max +5).",
    book: "CtL Subtle p.218",
  },
  {
    slug: "armor",
    name: "Dream Armor",
    kind: "subtle",
    glamour: 1,
    target: 1,
    description: "Armor = successes for one turn (ST track).",
    book: "CtL Subtle p.218",
  },
  // —— Paradigm ——
  {
    slug: "rewrite",
    name: "Rewrite Scene",
    kind: "paradigm",
    glamour: 3,
    target: 5,
    description: "Completely change dream scenery (flavor).",
    book: "CtL Paradigm p.219",
  },
  {
    slug: "persistent",
    name: "Persistent Brand",
    kind: "paradigm",
    glamour: 3,
    target: 7,
    description: "Inflict a lasting Condition until leave dream.",
    book: "CtL Paradigm p.219",
    applyCondition: "obsession",
  },
  {
    slug: "env-tilt",
    name: "Dream Storm",
    kind: "paradigm",
    glamour: 3,
    target: 5,
    description: "Environmental Tilt on the dream scene.",
    book: "CtL Paradigm p.219",
    applyTilt: "heavy-rain",
  },
  {
    slug: "transfer",
    name: "Transfer Emotion",
    kind: "paradigm",
    glamour: 4,
    target: 9,
    description: "Move an emotional Condition onto another (ST).",
    book: "CtL Paradigm p.219",
  },
  {
    slug: "impossible",
    name: "Impossible Act",
    kind: "paradigm",
    glamour: 4,
    target: 8,
    description: "One impossible action vs the dream environment.",
    book: "CtL Paradigm p.219",
  },
  {
    slug: "road-shift",
    name: "Shift the Road",
    kind: "paradigm",
    glamour: 3,
    target: 6,
    description: "Open a temporary path to a named Road node (ST).",
    book: "CtL Dreaming Roads",
  },
];

export function findWeaveFull(key: string): WeaveDefFull | null {
  const q = key.toLowerCase().trim();
  return (
    WEAVE_CATALOG.find(
      (e) =>
        e.slug === q ||
        e.name.toLowerCase() === q ||
        e.name.toLowerCase().includes(q),
    ) ?? null
  );
}
