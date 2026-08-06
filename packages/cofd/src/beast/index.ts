export {
  rollFrenzyResist,
  enterFrenzy,
  endFrenzy,
  isFrenzied,
  parseFrenzyKind,
  type FrenzyKind,
  type FrenzyRollResult,
  type FrenzyOutcome,
} from "./frenzy.ts";
export {
  AURA_FLAVORS,
  findAuraFlavor,
  rollAuraContest,
  applyAuraCondition,
  projectorPools,
  resistPools,
  type AuraFlavor,
  type AuraContestResult,
} from "./aura.ts";
export {
  applyFeed,
  parseFeedSource,
  slakeCap,
  type FeedSource,
  type FeedResult,
} from "./feed.ts";
