// splats/wta/data/comboGifts.ts -- M20 Combo Gifts seed.
//
// A combo gift fuses two or more known gifts into a single named maneuver.
// Prereq slugs must match keys in WTA_GIFTS. Restrictions (when set) are
// lowercase, hyphenated tribe/auspice/breed ids matched against the
// character's tribe/auspice/breed (normalized the same way).
import type { IComboGiftDef } from "../../../core/types.ts";

export const WTA_COMBO_GIFTS: Record<string, IComboGiftDef> = {
  "cooking-the-books": {
    slug: "cooking-the-books",
    name: "Cooking the Books",
    level: 2,
    prereqs: ["cooking", "persuasion"],
    restrictions: ["bone-gnawers"],
    action: {
      roll: { pool: "Manipulation+Subterfuge", difficulty: 7 },
      cost: { gnosis: 1, willpower: 1 },
      duration: "scene",
      description:
        "Falsify ledgers or paperwork so the lies pass casual scrutiny for the scene.",
    },
  },

  "bury-the-wolf": {
    slug: "bury-the-wolf",
    name: "Bury the Wolf",
    level: 4,
    prereqs: ["persuasion", "calm"],
    restrictions: ["children-of-gaia"],
    action: {
      roll: { pool: "Charisma+Empathy", difficulty: 8 },
      cost: { gnosis: 2, willpower: 1 },
      duration: "scene",
      description:
        "Suppress the Rage of one Garou for the scene; they cannot frenzy or shift involuntarily.",
    },
  },

  "heart-of-the-mender": {
    slug: "heart-of-the-mender",
    name: "Heart of the Mender",
    level: 3,
    prereqs: ["mother's touch", "calm"],
    restrictions: ["children-of-gaia"],
    action: {
      roll: { pool: "Wits+Empathy", difficulty: 7 },
      cost: { gnosis: 2 },
      duration: "scene",
      description:
        "Heal one target of bashing AND emotional turmoil simultaneously; each success removes a bashing level and one Composure-disrupting condition.",
    },
  },

  "leap-of-the-hare": {
    slug: "leap-of-the-hare",
    name: "Leap of the Hare",
    level: 2,
    prereqs: ["hare's leap", "falling touch"],
    restrictions: [],
    action: {
      roll: { pool: "Dexterity+Athletics", difficulty: 6 },
      cost: { rage: 1 },
      duration: "turn",
      description:
        "Pounce up to thirty feet and knock the target prone on a successful strike.",
    },
  },

  "wolf-at-the-stockyard": {
    slug: "wolf-at-the-stockyard",
    name: "Wolf at the Stockyard",
    level: 3,
    prereqs: ["wolf at the door", "cooking"],
    restrictions: ["bone-gnawers"],
    action: {
      roll: { pool: "Manipulation+Intimidation", difficulty: 7 },
      cost: { rage: 1, gnosis: 1 },
      duration: "scene",
      description:
        "Cause a market or kitchen to fail spectacularly -- food spoils, ledgers vanish, fear takes root.",
    },
  },

  "razor-of-the-hunter": {
    slug: "razor-of-the-hunter",
    name: "Razor of the Hunter",
    level: 3,
    prereqs: ["razor claws", "eye of the hunter"],
    restrictions: [],
    action: {
      roll: { pool: "Perception+Brawl", difficulty: 7 },
      cost: { rage: 2 },
      duration: "scene",
      description:
        "Claws ignore one point of soak per success against the marked prey for the scene.",
    },
  },

  "iron-walls-of-mind": {
    slug: "iron-walls-of-mind",
    name: "Iron Walls of Mind",
    level: 4,
    prereqs: ["iron resolve", "resist pain"],
    restrictions: ["stargazers"],
    action: {
      roll: { pool: "Stamina+Meditation", difficulty: 8 },
      cost: { willpower: 2 },
      duration: "scene",
      description:
        "Ignore wound penalties AND all attempts at mental influence for the scene.",
    },
  },

  "voice-of-the-spider": {
    slug: "voice-of-the-spider",
    name: "Voice of the Spider",
    level: 2,
    prereqs: ["spider's song", "persuasion"],
    restrictions: ["ragabash"],
    action: {
      roll: { pool: "Manipulation+Technology", difficulty: 7 },
      cost: { gnosis: 1 },
      duration: "scene",
      description:
        "Persuade one target by phone, radio, or net-stream as though face to face.",
    },
  },

  "shroud-of-the-mother": {
    slug: "shroud-of-the-mother",
    name: "Shroud of the Mother",
    level: 3,
    prereqs: ["mother's touch", "shroud"],
    restrictions: [],
    action: {
      roll: { pool: "Wits+Occult", difficulty: 7 },
      cost: { gnosis: 2 },
      duration: "scene",
      description:
        "Conceal a healed wound so neither sight nor scent reveals it for the scene.",
    },
  },

  "true-words-of-judgment": {
    slug: "true-words-of-judgment",
    name: "True Words of Judgment",
    level: 3,
    prereqs: ["truth of gaia", "fangs of judgment"],
    restrictions: ["philodox"],
    action: {
      roll: { pool: "Wits+Subterfuge", difficulty: 8 },
      cost: { gnosis: 1, willpower: 1 },
      duration: "scene",
      description:
        "Compel one truth from a target; refusal inflicts a single level of unsoakable bashing damage.",
    },
  },
};

/** Total count of combo gifts in this data file. */
export const COMBO_GIFT_COUNT = Object.keys(WTA_COMBO_GIFTS).length;
