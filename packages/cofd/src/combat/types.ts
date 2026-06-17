// Combat encounter types for CoFD 2e Phase B.

export type EncounterStatus = "intent" | "active" | "resolved";

/** Pass 2: shape of a structured cover record (richer than a bare number). */
export interface CoverState {
  durability: number;
  structure: number;
  maxStructure: number;
  name: string;
}

/** Reaction posture set by +turn/reaction. */
export interface ReactionPosture {
  type: "ambush" | "overwatch" | "guard" | "first-fire-on-adjacent";
  targetId?: string;
}

/** One actor's slot in an encounter initiative order. */
export interface Participant {
  actorId: string;
  name: string;
  /** Initiative roll result (1d10 + Dex + Composure + weapon modifier). */
  initiative: number;
  /** How many attacks this participant has applied Defense against this round. */
  appliedDefense: number;
  /** True if the participant declared a Dodge action this round. */
  isDodging: boolean;
  /** True if incapacitated (Incapacitated health state). */
  isOut: boolean;
  /**
   * Durability of cover behind the participant. Legacy: bare number 0..3.
   * Pass 2: structured CoverState carries Structure / Durability and a label
   * so the engine can chip it on overflow damage.
   */
  cover?: number | CoverState;
  /** Concealment level (1=light, 2=medium, 3=heavy). 0 / undefined means none. */
  concealment?: number;
  /** Actor id of the suppressor who currently has this participant pinned. */
  pinnedBy?: string;
  /** True while the participant has declared a non-violent surrender. */
  surrendered?: boolean;
  /** True if the participant has used their move action this round. */
  movedThisRound?: boolean;
  /** True if the participant is currently in the Beaten Down condition. */
  beatenDown?: boolean;
  /** True once the participant has used their one instant action this turn. */
  actionUsed?: boolean;
  /** True while the participant has Delayed their action this round. */
  delayed?: boolean;
  /** True if the participant chose to Run this turn (consumes instant slot, -1 Defense). */
  ran?: boolean;
  /** Pass 2: pc | npc -- derived from actor flags at addParticipant. */
  kind?: "pc" | "npc";
  /** Pass 2: reaction posture set via +turn/reaction. Consumed by AI / engine. */
  reactionPosture?: ReactionPosture;
  /** Pass 2: AI memory of damage dealt by actorId -> total damage. */
  threat?: Record<string, number>;
  /** Pass 2: archetype scratchpad (frenzied, fled, revenge, etc.). */
  aiState?: Record<string, unknown>;
  /** True if the participant has been surprised/ambushed and loses their turn. */
  surprised?: boolean;
  /** True if the participant has established a hold in a grapple. */
  hasHold?: boolean;
  /** True if the participant has control of the opponent's weapon in a grapple. */
  hasControl?: boolean;
  /** True if the participant is restrained in a grapple. */
  isRestrained?: boolean;
  /** True if the participant is using their grapple target as human cover. */
  isUsingAsCover?: boolean;
}

/** Pass 2: cover helper -- coerce CoverState | number | undefined to Durability. */
export function getCoverDurability(p: Participant): number {
  const c = p.cover;
  if (typeof c === "number") return c;
  if (c && typeof c === "object") return c.durability;
  return 0;
}

/** Pass 2: a room-scoped cover/object the engine tracks (durability + structure). */
export interface TerrainObject {
  id: string;
  kind: "cover" | "door" | "vehicle" | "object";
  durability: number;
  structure: number;
  maxStructure: number;
  name: string;
}

/** A live combat encounter anchored to a room. */
export interface Encounter {
  id: string;
  roomId: string;
  round: number;
  /** Index into participants[] pointing at whose turn it currently is. */
  turnIdx: number;
  participants: Participant[];
  status: EncounterStatus;
  createdAt: number;
  /** Pass 2: safety cap on auto-walker rounds. Defaults to 50. */
  maxRounds?: number;
  /** Pass 2: room-scoped cover/objects the engine tracks. */
  terrain?: TerrainObject[];
  /** Pass 2: optional encounter display name (for scene resolution broadcast). */
  name?: string;
}
