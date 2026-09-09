// Auspex L1-5.

import { p, type IPowerDef } from "./types.ts";

export const AUSPEX_POWERS: readonly IPowerDef[] = [
  p({
    slug: "heightened-senses",
    discipline: "Auspex",
    level: 1,
    name: "Heightened Senses",
    bloodCost: 0,
    effect: "toggle",
    toggleKey: "heightenedSenses",
    blurb: "Sharpen all senses (toggle). ST may call Perception rolls.",
    book: "V20 p.134",
  }),
  p({
    slug: "aura-perception",
    discipline: "Auspex",
    level: 2,
    name: "Aura Perception",
    bloodCost: 0,
    pool: "Perception+Empathy",
    difficulty: 8,
    effect: "roll_pose",
    needsTarget: true,
    blurb:
      "Read emotional colors in a subject's aura. " +
      "Diablerie stains appear as black veins.",
    book: "V20 p.135",
  }),
  p({
    slug: "the-spirits-touch",
    discipline: "Auspex",
    level: 3,
    name: "The Spirit's Touch",
    bloodCost: 0,
    pool: "Perception+Empathy",
    difficulty: 7,
    effect: "roll_pose",
    blurb: "Read psychic residue on an object or place.",
    book: "V20 p.136",
  }),
  p({
    slug: "telepathy",
    discipline: "Auspex",
    level: 4,
    name: "Telepathy",
    bloodCost: 0,
    pool: "Intelligence+Subterfuge",
    difficulty: 7,
    effect: "opposed",
    needsTarget: true,
    resist: "willpower",
    blurb: "Read surface thoughts; resisted with Willpower.",
    book: "V20 p.137",
  }),
  p({
    slug: "psychic-projection",
    discipline: "Auspex",
    level: 5,
    name: "Psychic Projection",
    bloodCost: 1,
    effect: "shape",
    shapeForm: "mist",
    flagKey: "astral",
    flagValue: true,
    blurb:
      "Project your senses as an astral form (body helpless). " +
      "Toggle off with the same power.",
    book: "V20 p.138",
  }),
];
