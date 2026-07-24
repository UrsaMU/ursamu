export type {
  HedgeConfig,
  HedgeDanger,
  HedgeNavState,
  HedgeRealm,
  HedgeRoom,
  HedgeSheetState,
  Hedgeway,
  HedgewayState,
} from "./types.ts";
export {
  HEDGE_CONFIG_ID,
  HEDGE_TURN_MS,
  PORTAL_GLAMOUR_COST,
} from "./types.ts";
export {
  defaultHedgeRoom,
  isHedgeDanger,
  isHedgeRealm,
  isInHedge,
  parseHedgeRoom,
  roomRealmLabel,
} from "./room.ts";
export {
  addHollowEnhancement,
  enhancementDotsUsed,
  findHollowEnhancement,
  freeHollowDots,
  hollowAnonymityPenalty,
  hollowHas,
  homeTurfBonus,
  HOLLOW_ENHANCEMENTS,
  isHollowOwner,
  removeHollowEnhancement,
  type HollowEnhancementDef,
} from "./hollow.ts";
export {
  hiddenEntryActive,
  hiddenEntryPenalty,
  queueShadowFruit,
  readyShadowFruit,
  readShadowPending,
  writeShadowPending,
  type ShadowPending,
} from "./hollow_effects.ts";
// hollow.ts re-exports catalog
export {
  canOpenWithKey,
  keyPhraseMatches,
  normalizeKeyPhrase,
  wayHasKey,
} from "./keys.ts";
export {
  createHedgeway,
  destroyHedgeway,
  findHedgewayById,
  findHedgewayByName,
  freeOpenForLost,
  getSeason,
  hedgeConfigDb,
  hedgewayDb,
  listHedgeways,
  openHedgeway,
  otherSideRoom,
  refreshHedgeway,
  setSeason,
  updateHedgeway,
  waysForRoom,
  wayStateLabel,
} from "./ways.ts";
export {
  applyTrailOnMien,
  checkPortalEnter,
  readHedgeState,
  spendGlamour,
  trailActive,
  TRAIL_MS,
  writeHedgeState,
  type PortalCheck,
} from "./portal.ts";
export {
  onMaskDownOpenWays,
  type MaskGateResult,
} from "./mask_gate.ts";
export {
  buildNavPools,
  countCondMods,
  readNavState,
  resolveNavTurn,
  writeNavState,
  type NavContext,
  type NavOutcomeKind,
  type NavPools,
  type NavTurnResult,
  type NavUrgency,
} from "./nav.ts";
export {
  findFruit,
  fruitCarryCap,
  GOBLIN_FRUITS,
  listFruits,
  pickForageFruit,
  type FruitEffect,
  type FruitRarity,
  type GoblinFruit,
} from "./fruit_catalog.ts";
export {
  addFruit,
  countFruit,
  enforceFruitCap,
  hasFruitFlag,
  readFruitFlags,
  readFruitInv,
  removeOneFruit,
  writeFruitFlags,
  writeFruitInv,
  type CarriedFruit,
  type FruitFlag,
} from "./fruit_inv.ts";
export {
  applyFruitEffects,
  eatFruit,
  type EatResult,
} from "./fruit_eat.ts";
export {
  foragePool,
  resolveForage,
  type ForageInput,
  type ForageResult,
} from "./fruit_forage.ts";
export {
  consumeFruitObject,
  countFruitObjects,
  createFruitObject,
  fruitDisplayName,
  fruitGotAt,
  fruitMaskName,
  fruitSlug,
  isFruitObj,
  listFruitObjects,
} from "./fruit_objects.ts";
export {
  enforceFruitObjectCap,
  migrateSheetFruitToObjects,
} from "./fruit_cap.ts";
export { itemData } from "../equipment/objects.ts";
