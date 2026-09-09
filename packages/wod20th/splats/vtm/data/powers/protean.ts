// Protean L1-5.

import { p, type IPowerDef } from "./types.ts";

export const PROTEAN_POWERS: readonly IPowerDef[] = [
  p({
    slug: "eyes-of-the-beast",
    discipline: "Protean",
    level: 1,
    name: "Eyes of the Beast",
    bloodCost: 0,
    effect: "pose",
    blurb: "See in absolute darkness; eyes glow red.",
    book: "V20 p.199",
  }),
  p({
    slug: "feral-claws",
    discipline: "Protean",
    level: 2,
    name: "Feral Claws",
    bloodCost: 1,
    effect: "claws",
    blurb:
      "Grow claws: Brawl deals aggravated, +1 damage die. " +
      "Toggle off with the same power.",
    book: "V20 p.199",
  }),
  p({
    slug: "earth-meld",
    discipline: "Protean",
    level: 3,
    name: "Earth Meld",
    bloodCost: 1,
    effect: "shape",
    shapeForm: "earth",
    blurb: "Sink into natural earth to rest safely until sunset (toggle).",
    book: "V20 p.200",
  }),
  p({
    slug: "shape-of-the-beast",
    discipline: "Protean",
    level: 4,
    name: "Shape of the Beast",
    bloodCost: 1,
    effect: "shape",
    shapeForm: "beast",
    blurb: "Become wolf or bat (toggle). Stats shift per ST/V20.",
    book: "V20 p.200",
  }),
  p({
    slug: "mist-form",
    discipline: "Protean",
    level: 5,
    name: "Mist Form",
    bloodCost: 1,
    effect: "shape",
    shapeForm: "mist",
    blurb: "Become mist; immune to most physical attacks (toggle).",
    book: "V20 p.201",
  }),
];
