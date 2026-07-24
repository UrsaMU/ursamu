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

/** Host-only bag — engine never interprets keys. */
export type CombatMeta = Record<string, unknown>;

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
  /**
   * Soft faction / side label for AI targeting
   * (e.g. "pc", "hunter", "corp"). Optional.
   */
  side?: string;
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
  spentEnergy?: number;
  /** Host-only extension bag. */
  meta?: CombatMeta;
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

/** Default max combat log lines retained on an encounter. */
export const DEFAULT_ENCOUNTER_LOG_CAP = 50;

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
  /** Actor id who opened the fight (UX / permissions). */
  startedBy?: string;
  /** Rolling combat log (newest at end). */
  log?: string[];
  /** Host-only extension bag. */
  meta?: CombatMeta;
}

/**
 * Append a log line; trims to `cap` entries (oldest dropped).
 * Returns a new encounter object (does not persist).
 */
export function appendEncounterLog(
  enc: Encounter,
  line: string,
  cap = DEFAULT_ENCOUNTER_LOG_CAP,
): Encounter {
  const text = String(line ?? "").trim();
  if (!text) return enc;
  const prev = enc.log ?? [];
  const log = [...prev, text];
  const max = Math.max(1, Math.floor(cap));
  const trimmed = log.length > max ? log.slice(-max) : log;
  return { ...enc, log: trimmed };
}

/** Merge host meta bags (shallow). */
export function mergeMeta(
  base?: CombatMeta,
  patch?: CombatMeta,
): CombatMeta | undefined {
  if (!base && !patch) return undefined;
  return { ...(base ?? {}), ...(patch ?? {}) };
}
