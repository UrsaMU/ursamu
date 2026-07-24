/**
 * Combat encounter types — single-sourced from @ursamu/combat.
 * Do not redefine shapes here; extend the combat package if needed.
 */
export type {
  CoverState,
  Encounter,
  EncounterStatus,
  Participant,
  ReactionPosture,
  TerrainObject,
} from "@ursamu/combat";

export { getCoverDurability } from "@ursamu/combat";
