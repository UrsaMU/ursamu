/** Encounter lifecycle. */
export type EncounterStatus = "intent" | "active" | "resolved";

/** Structured cover (richer than a bare durability number). */
export interface CoverState {
  durability: number;
  structure: number;
  maxStructure: number;
  name: string;
}

/** Reaction posture (ambush, overwatch, etc.). */
export interface ReactionPosture {
  type: "ambush" | "overwatch" | "guard" | "first-fire-on-adjacent";
  targetId?: string;
}

/** One actor slot in initiative order. */
export interface Participant {
  actorId: string;
  name: string;
  initiative: number;
  appliedDefense: number;
  isDodging: boolean;
  isOut: boolean;
  cover?: number | CoverState;
  concealment?: number;
  pinnedBy?: string;
  surrendered?: boolean;
  movedThisRound?: boolean;
  beatenDown?: boolean;
  actionUsed?: boolean;
  delayed?: boolean;
  ran?: boolean;
  kind?: "pc" | "npc";
  reactionPosture?: ReactionPosture;
  /** Damage memory: attackerId → total damage. */
  threat?: Record<string, number>;
  /** Brain scratchpad (frenzied, fled, revealed, …). */
  aiState?: Record<string, unknown>;
  surprised?: boolean;
  hasHold?: boolean;
  hasControl?: boolean;
  isRestrained?: boolean;
  isUsingAsCover?: boolean;
}

export function getCoverDurability(p: Participant): number {
  const c = p.cover;
  if (typeof c === "number") return c;
  if (c && typeof c === "object") return c.durability;
  return 0;
}

/** Room-scoped cover / object the engine tracks. */
export interface TerrainObject {
  id: string;
  kind: "cover" | "door" | "vehicle" | "object";
  durability: number;
  structure: number;
  maxStructure: number;
  name: string;
}

/** Live combat encounter anchored to a room. */
export interface Encounter {
  id: string;
  roomId: string;
  round: number;
  turnIdx: number;
  participants: Participant[];
  status: EncounterStatus;
  createdAt: number;
  maxRounds?: number;
  terrain?: TerrainObject[];
  name?: string;
}
