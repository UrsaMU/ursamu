// splats/wta/data/talens.ts -- canonical W20 talens (one-shot fetishes).
//
// Talens are spirit-bound objects consumed on a single use. They share
// the fetish substrate (kind=fetish, fetishCost in Gnosis, frenzy gate,
// splat gate) but `talen: true` flags them; `talenSpent: true` marks
// them used. Builders set `talen` via `@eq/talen <item>=true`.
//
// Source: WtA W20 pp.228-229.

export interface ITalenDef {
  slug: string;
  name: string;
  /** Gnosis cost to invoke. Default 1. */
  cost: number;
  /** Type of spirit traditionally bound. Flavor; not mechanical. */
  spirit: string;
  description: string;
}

export const WTA_TALENS: Record<string, ITalenDef> = {
  "bane-arrows": {
    slug: "bane-arrows",
    name: "Bane Arrows",
    cost: 1,
    spirit: "Bane / war-spirit",
    description:
      "An arrow that strikes true; the bound bane sights for the archer. " +
      "Counts the shot as aggravated against Wyrm-tainted creatures.",
  },
  "chiropteran-spies": {
    slug: "chiropteran-spies",
    name: "Chiropteran Spies",
    cost: 1,
    spirit: "Bat-spirit",
    description:
      "A small bat figurine. Released, the spirit-bat scouts a half-mile " +
      "radius and reports back what it saw in flashes of sense-memory.",
  },
  "death-dust": {
    slug: "death-dust",
    name: "Death Dust",
    cost: 1,
    spirit: "Wormgaunt",
    description:
      "A pinch of grey ash. Thrown into a wound it inflicts an additional " +
      "level of aggravated damage as the wormgaunt feeds on the injury.",
  },
  "gaias-breath": {
    slug: "gaias-breath",
    name: "Gaia's Breath",
    cost: 1,
    spirit: "Wind elemental",
    description:
      "A glass vial of sweet air. Broken, it purges one room of toxin, " +
      "smoke, or airborne Wyrm-taint for one scene.",
  },
  "hag-talon": {
    slug: "hag-talon",
    name: "Hag-Talon",
    cost: 2,
    spirit: "Crone-spirit",
    description:
      "A blackened nail wrapped in red thread. Pressed to a sleeping " +
      "target it inflicts a single night of true-seeing nightmares.",
  },
  "horn-of-distress": {
    slug: "horn-of-distress",
    name: "Horn of Distress",
    cost: 1,
    spirit: "Bull-spirit",
    description:
      "A small ivory horn. Blown, it sounds in the spirit ears of every " +
      "Garou within ten miles -- a one-shot pack call.",
  },
  "moon-glow": {
    slug: "moon-glow",
    name: "Moon Glow",
    cost: 1,
    spirit: "Lune",
    description:
      "A pale stone. Crushed, it sheds full-moon light in a 30-foot radius " +
      "for one scene; counts as moonlight for any gift or rite that needs it.",
  },
  "moon-sign": {
    slug: "moon-sign",
    name: "Moon Sign",
    cost: 1,
    spirit: "Lune",
    description:
      "A coin marked with the user's auspice. Spent, it grants one auto-success " +
      "on any single roll made under that auspice's moon.",
  },
  "nightshade": {
    slug: "nightshade",
    name: "Nightshade",
    cost: 1,
    spirit: "Shadow-spirit",
    description:
      "A vial of black liquid. Swallowed, it cloaks the drinker in shadow " +
      "(+2 dice to Stealth, no shadow cast) for one scene.",
  },
  "spirit-snare": {
    slug: "spirit-snare",
    name: "Spirit Snare",
    cost: 2,
    spirit: "Hunter-spirit",
    description:
      "A circle of bone-cord. Laid open in the Penumbra it binds the next " +
      "spirit of rank 1 or 2 that crosses it; lasts one hour or until banished.",
  },
  "test-vial": {
    slug: "test-vial",
    name: "Test Vial",
    cost: 1,
    spirit: "Truth-spirit",
    description:
      "A small glass tube. Dripping any liquid in turns it black if poisoned, " +
      "red if tainted by the Wyrm, clear if clean.",
  },
  "wind-snorkel": {
    slug: "wind-snorkel",
    name: "Wind Snorkel",
    cost: 1,
    spirit: "Air elemental",
    description:
      "A reed pierced with a single sigil. Held in the mouth, the user " +
      "breathes freely underwater for one scene.",
  },
  "wyrm-scale": {
    slug: "wyrm-scale",
    name: "Wyrm Scale",
    cost: 1,
    spirit: "Bound bane",
    description:
      "A flat black scale. Pressed to skin, it grants one extra level of " +
      "armor (+1 soak) against Wyrm-creature attacks for one scene.",
  },
};

/** Safe lookup with own-property guard (no prototype pollution). */
export function getTalen(slug: string): ITalenDef | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(WTA_TALENS, key)) return undefined;
  return WTA_TALENS[key];
}

export function allTalens(): ITalenDef[] {
  return Object.values(WTA_TALENS);
}
