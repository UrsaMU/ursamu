// V20 merit/flaw catalog for chargen (expanded set with hooks).
import type { IMeritDef, IFlawDef } from "../../../core/types.ts";

export const VTM_MERITS: readonly IMeritDef[] = [
  {
    name: "Acute Sense",
    cost: 1,
    category: "Physical",
    notes: "V20 p.480 -- one sense is exceptionally sharp (+2).",
  },
  {
    name: "Ambidextrous",
    cost: 1,
    category: "Physical",
    notes: "V20 p.480 -- no off-hand penalty.",
  },
  {
    name: "Eat Food",
    cost: 1,
    category: "Physical",
    notes: "V20 p.480 -- can consume food for the Masquerade.",
  },
  {
    name: "Catlike Balance",
    cost: 1,
    category: "Physical",
    notes: "V20 p.480 -- +2 on balance / landing rolls.",
  },
  {
    name: "Common Sense",
    cost: 1,
    category: "Mental",
    notes: "V20 p.483 -- ST may warn against folly.",
  },
  {
    name: "Eidetic Memory",
    cost: 2,
    category: "Mental",
    notes: "V20 p.483 -- perfect recall.",
  },
  {
    name: "Concentration",
    cost: 1,
    category: "Mental",
    notes: "V20 p.483 -- ignore environmental distractions.",
  },
  {
    name: "Natural Linguist",
    cost: 2,
    category: "Mental",
    notes: "V20 p.484 -- languages come easily.",
  },
  {
    name: "Natural Leader",
    cost: 1,
    category: "Social",
    notes: "V20 p.485 -- +2 dice on Leadership rolls.",
  },
  {
    name: "Prestigious Sire",
    cost: 1,
    category: "Social",
    notes: "V20 p.486 -- sire's reputation opens doors.",
  },
  {
    name: "Sanctity",
    cost: 2,
    category: "Social",
    notes: "V20 p.486 -- others sense a pure aura.",
  },
  {
    name: "Unbondable",
    cost: 3,
    category: "Supernatural",
    notes: "V20 p.494 -- immune to blood bonds (enforced).",
  },
  {
    name: "True Love",
    cost: 1,
    category: "Supernatural",
    notes: "V20 p.494 -- a living anchor vs the Beast.",
  },
  {
    name: "Lucky",
    cost: 3,
    category: "Supernatural",
    notes: "V20 p.493 -- once per story, re-roll a failed roll (ST).",
  },
  {
    name: "Iron Will",
    cost: 3,
    category: "Supernatural",
    notes: "V20 p.493 -- +3 dice to resist Dominate / mind control.",
  },
];

export const VTM_FLAWS: readonly IFlawDef[] = [
  {
    name: "Deep Sleeper",
    bonus: 1,
    category: "Physical",
    notes: "V20 p.481 -- hard to awaken by day.",
  },
  {
    name: "Smell of the Grave",
    bonus: 1,
    category: "Physical",
    notes: "V20 p.482 -- earthy odor.",
  },
  {
    name: "Disease Carrier",
    bonus: 1,
    category: "Physical",
    notes: "V20 p.481 -- vessels may catch illness.",
  },
  {
    name: "Nightmares",
    bonus: 1,
    category: "Mental",
    notes: "V20 p.484 -- restless days.",
  },
  {
    name: "Prey Exclusion",
    bonus: 1,
    category: "Mental",
    notes:
      "V20 p.484 -- refuse a class of vessel " +
      "(set powerFlags.preyExclusion).",
  },
  {
    name: "Phobia",
    bonus: 2,
    category: "Mental",
    notes: "V20 p.484 -- crippling fear of something.",
  },
  {
    name: "Dark Secret",
    bonus: 1,
    category: "Social",
    notes: "V20 p.486 -- something that could ruin you.",
  },
  {
    name: "Enemy",
    bonus: 1,
    category: "Social",
    notes: "V20 p.486 -- someone wants you harmed.",
  },
  {
    name: "Hunted",
    bonus: 3,
    category: "Social",
    notes: "V20 p.487 -- hunters or rivals pursue you.",
  },
  {
    name: "Notoriety",
    bonus: 2,
    category: "Social",
    notes: "V20 p.487 -- infamous among Kindred.",
  },
  {
    name: "Touch of Frost",
    bonus: 1,
    category: "Supernatural",
    notes: "V20 p.495 -- plants die at your touch.",
  },
  {
    name: "Cursed",
    bonus: 1,
    category: "Supernatural",
    notes: "V20 p.494 -- a lasting supernatural curse (ST).",
  },
  {
    name: "Repelled by Crosses",
    bonus: 3,
    category: "Supernatural",
    notes: "V20 p.495 -- faith symbols drive you back.",
  },
  {
    name: "Thin Blood",
    bonus: 4,
    category: "Supernatural",
    notes: "V20 p.495 -- weak vitae; Embrace may fail.",
  },
];
