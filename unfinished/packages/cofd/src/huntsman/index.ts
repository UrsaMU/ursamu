// Huntsman barrel (CtL Wild Hunt light).

export type {
  HunterState,
  HuntStage,
  HuntsmanPowerDef,
  HuntsmanPowerSlug,
  QuarryHuntState,
} from "./types.ts";
export {
  HUNTSMAN_POWERS,
  defaultHuntsmanPowers,
  findHuntsmanPower,
} from "./powers.ts";
export {
  applyTrackResult,
  endHunt,
  initHuntsmanSheet,
  isHuntsmanSheet,
  readHunterState,
  readQuarryHunt,
  stageFromProgress,
  startHunt,
  trackPoolBonus,
  writeHunterState,
  writeQuarryHunt,
} from "./hunt.ts";
export {
  activateHuntsmanPower,
  type HuntPowerResult,
} from "./activate.ts";
