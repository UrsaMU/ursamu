// splats/wta/data/challenges.ts -- Formal Garou challenges (W20 Ch.2).
//
// A challenge is a structured contest -- staredown, words, single combat,
// klaive-duel, death-duel, etc. -- between two Garou. Each type carries
// a pool expression (parseable by core/dice.ts resolvePoolExpr) and a
// difficulty; combat-typed challenges resolve through +attack instead of
// a pool roll. Victory awards temp renown; declining costs temp renown.

import type { RenownTrack } from "../../../core/renown.ts";

export interface IChallengeReward {
  track: RenownTrack;
  /** Positive integer; awardRenown only accepts positive ints. */
  amount: number;
}

export interface IChallengeType {
  slug: string;
  name: string;
  description: string;
  /**
   * Pool expression for a contested roll (e.g. "Charisma+Intimidation").
   * Empty string when this challenge type resolves through combat instead.
   */
  pool: string;
  /** Difficulty for the contested roll (2..10). 6 for combat types. */
  difficulty: number;
  /** Renown awarded to the winner on resolve. */
  victoryReward: IChallengeReward;
  /** Renown deducted from a target who declines (cowardice penalty). */
  declineCost: IChallengeReward;
  /** Klaive-duels require both Garou to wield a fetish weapon. */
  requiresKlaive?: boolean;
  /** Death-duels require a sept-leader consent stamp before /resolve fires. */
  requiresSeptConsent?: boolean;
  /** Combat-typed challenges resolve via +attack first-blood. */
  isCombat?: boolean;
  /**
   * When set, an actor with this normalised auspice id gains +1 die
   * to the challenge pool (Galliards spin tales; Theurges hear spirits).
   */
  bonusAuspice?: "galliard" | "theurge";
}

export const CHALLENGE_TYPES: Record<string, IChallengeType> = {
  staredown: {
    slug: "staredown",
    name: "Staredown",
    description:
      "Eyes lock; will meets will. Whoever flinches first loses face.",
    pool: "Charisma+Intimidation",
    difficulty: 7,
    victoryReward: { track: "honor", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
  },
  howling: {
    slug: "howling",
    name: "Howling",
    description:
      "Throats opened to the moon -- whose howl carries the bawn the loudest?",
    pool: "Stamina+Performance",
    difficulty: 6,
    victoryReward: { track: "glory", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
  },
  words: {
    slug: "words",
    name: "Challenge of Words",
    description:
      "A formal debate before the sept. The Litany is cited; the truth is named.",
    pool: "Manipulation+Expression",
    difficulty: 7,
    victoryReward: { track: "wisdom", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
  },
  wits: {
    slug: "wits",
    name: "Challenge of Wits",
    description:
      "Riddles, puzzles, lore -- a clean test of mind sharpened against mind.",
    pool: "Wits+Enigmas",
    difficulty: 7,
    victoryReward: { track: "wisdom", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
  },
  stories: {
    slug: "stories",
    name: "Challenge of Stories",
    description:
      "Two tellers, one fire. The pack judges who shapes truth into beauty.",
    pool: "Charisma+Performance",
    difficulty: 7,
    victoryReward: { track: "glory", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
    bonusAuspice: "galliard",
  },
  spirits: {
    slug: "spirits",
    name: "Challenge of Spirits",
    description:
      "Each calls a spirit to their service. The deeper-rooted prevails.",
    pool: "Wits+Occult",
    difficulty: 8,
    victoryReward: { track: "wisdom", amount: 1 },
    declineCost:   { track: "honor", amount: 1 },
    bonusAuspice: "theurge",
  },
  "single-combat": {
    slug: "single-combat",
    name: "Single Combat",
    description:
      "Tooth and fist; no fetish weapons. First blood ends the matter.",
    pool: "",
    difficulty: 6,
    victoryReward: { track: "glory", amount: 2 },
    declineCost:   { track: "honor", amount: 1 },
    isCombat: true,
  },
  "klaive-duel": {
    slug: "klaive-duel",
    name: "Klaive Duel",
    description:
      "Steel meets steel. Both Garou must wield a fetish weapon. First blood.",
    pool: "",
    difficulty: 6,
    victoryReward: { track: "glory", amount: 2 },
    declineCost:   { track: "honor", amount: 2 },
    isCombat: true,
    requiresKlaive: true,
  },
  "death-duel": {
    slug: "death-duel",
    name: "Death Duel",
    description:
      "The gravest writ. Ends only when one Garou yields or falls. The " +
      "sept must consent before the circle is drawn.",
    pool: "",
    difficulty: 6,
    victoryReward: { track: "glory", amount: 3 },
    declineCost:   { track: "honor", amount: 2 },
    isCombat: true,
    requiresSeptConsent: true,
  },
};

/** Safe lookup with own-property guard (no prototype pollution). */
export function getChallengeType(slug: string): IChallengeType | undefined {
  const key = (slug ?? "").toLowerCase().trim();
  if (!key) return undefined;
  if (!Object.prototype.hasOwnProperty.call(CHALLENGE_TYPES, key)) return undefined;
  return CHALLENGE_TYPES[key];
}
