// Oneiromancy barrel (CtL light).

export type {
  BastionRoom,
  DreamGate,
  DreamState,
  WeaveDef,
  WeaveEffect,
} from "./types.ts";
export {
  attributeMaxForWyrd,
  buildChangelingDreamForm,
  dreamFormLines,
  readDreamState,
  writeDreamState,
} from "./form.ts";
export {
  enterHorn,
  enterIvory,
  enterOtherBastion,
  travelRoad,
  wakeDream,
  type EnterResult,
  type WakeResult,
} from "./enter.ts";
export {
  WEAVE_EFFECTS,
  findWeave,
  resolveWeave,
  weaveDreamerResult,
  type WeaveResult,
} from "./weave.ts";
export {
  WEAVE_CATALOG,
  findWeaveFull,
  type WeaveDefFull,
  type WeaveKind,
} from "./weave_catalog.ts";
export {
  addRoadLink,
  findLink,
  parseDreamRoom,
  roadStatusLines,
  type DreamRoadRoom,
  type RoadLink,
} from "./roads.ts";
