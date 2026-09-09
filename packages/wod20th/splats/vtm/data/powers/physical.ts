// Physical trio -- combat passives + Celerity.

import { p, type IPowerDef } from "./types.ts";

export const PHYSICAL_POWERS: readonly IPowerDef[] = [
  p({
    slug: "potence-passive",
    discipline: "Potence",
    level: 1,
    name: "Potence (passive)",
    bloodCost: 0,
    effect: "passive",
    blurb: "Add Potence dots as automatic successes on Strength damage.",
    book: "V20 p.192",
  }),
  p({
    slug: "fortitude-passive",
    discipline: "Fortitude",
    level: 1,
    name: "Fortitude (passive)",
    bloodCost: 0,
    effect: "passive",
    blurb: "Add Fortitude dots to soak; soak aggravated with Fortitude.",
    book: "V20 p.158",
  }),
  p({
    slug: "celerity-burst",
    discipline: "Celerity",
    level: 1,
    name: "Celerity",
    bloodCost: 1,
    effect: "celerity",
    blurb:
      "Spend 1 Blood per extra action (up to Celerity dots). " +
      "Extra actions ignore split penalty this turn.",
    book: "V20 p.142",
  }),
];
