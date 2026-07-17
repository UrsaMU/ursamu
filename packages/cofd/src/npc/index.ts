// NPC subsystem re-exports.

export * from "./types.ts";
export * from "./catalog.ts";
export * from "./sheet_from_template.ts";
// archetypes re-exports sheet helpers + legacy NpcArchetype API
export {
  NPC_ARCHETYPES,
  NPC_TIERS,
  archetypeHealthMax,
  archetypeKeys,
  getArchetype,
  sheetDefense,
  sheetFromArchetype,
  sheetHealthMax,
  sheetInitiative,
  sheetSpeed,
  templateToArchetype,
} from "./archetypes.ts";
export type { NpcArchetype } from "./archetypes.ts";
export * from "./dread.ts";
export * from "./directory.ts";
