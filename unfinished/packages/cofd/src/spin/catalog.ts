// Hedgespinning effect catalog lookup.

import type {
  SpinEffect,
  SpinEffectDef,
} from "./types.ts";

function e(
  slug: SpinEffect,
  name: string,
  kind: "subtle" | "paradigm",
  glamour: number,
  target: number,
  description: string,
  book: string,
): SpinEffectDef {
  return {
    slug,
    name,
    kind,
    glamour,
    target,
    description,
    needsHedge: true,
    book,
  };
}

export const SPIN_EFFECTS: readonly SpinEffectDef[] = [
  e("path", "Carve a Path", "subtle", 1, 1,
    "Next +hedge/travel +2 for 1 hour.", "CtL Subtle"),
  e("shelter", "Raise Shelter", "subtle", 1, 1,
    "Room leans safer (trod-like).", "CtL Subtle"),
  e("barrier", "Thorn Barrier", "subtle", 2, 2,
    "Wall of thorns / hazard (RP).", "CtL Subtle"),
  e("veil", "Veil the Glade", "subtle", 1, 1,
    "Set maskFlavor for the scene.", "CtL Subtle"),
  e("fruit", "Coax Fruit", "subtle", 2, 3,
    "Wring a common goblin fruit.", "CtL Subtle"),
  e("trap", "Snare", "subtle", 2, 2,
    "Personal Tilt snare (ST Ambushed).", "CtL Subtle"),
  e("equipment", "Fortuitous Tool", "subtle", 1, 1,
    "Equipment bonus next roll (max +5).", "CtL p.204"),
  e("armor", "Thorn Plate", "subtle", 1, 1,
    "Armor = successes for 1 turn (max 5).", "CtL p.204"),
  e("weapon", "Thorn Blade", "subtle", 1, 1,
    "Shape weapon Avail ≤ successes.", "CtL p.204"),
  e("guide", "Hedge Compass", "subtle", 1, 1,
    "Direction to a type of place.", "CtL p.204"),
  e("tilt", "Impose Tilt", "subtle", 2, 2,
    "Personal Tilt on a character (ST).", "CtL p.204"),
  e("edge", "Seize the Edge", "subtle", 2, 4,
    "Gain the Edge next nav turn.", "CtL p.204"),
  e("terrain", "Shape Terrain", "subtle", 2, 3,
    "Minor localized terrain feature.", "CtL p.204"),
  e("goblin-fruit", "Call Goblin Fruit", "paradigm", 3, 5,
    "Create one goblin fruit (catalog).", "CtL p.206"),
  e("env-tilt", "Environmental Tilt", "paradigm", 3, 5,
    "Environmental Tilt on the scene.", "CtL p.206"),
  e("scenery", "Rewrite Scenery", "paradigm", 4, 7,
    "Completely change scenery.", "CtL p.206"),
  e("danger-step", "Shift Danger", "paradigm", 4, 9,
    "Step trod↔Hedge↔Thorns one step.", "CtL p.206"),
];

export function listSpinEffects(): readonly SpinEffectDef[] {
  return SPIN_EFFECTS;
}

export function findSpinEffect(
  slugOrName: string,
): SpinEffectDef | null {
  const q = slugOrName.toLowerCase().trim();
  return (
    SPIN_EFFECTS.find(
      (x) =>
        x.slug === q ||
        x.name.toLowerCase() === q ||
        x.name.toLowerCase().includes(q),
    ) ?? null
  );
}

export function isSpinEffect(s: string): s is SpinEffect {
  return SPIN_EFFECTS.some((x) => x.slug === s);
}
