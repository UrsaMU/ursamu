// Social Maneuvering pure ops -- CoFD 2e p.81-83.
//
// Each maneuver is a persistent record in cofd.social-maneuvers tracking
// one initiator -> one subject relationship (one-way, per the rules).
// Pure functions take the maneuver and return the mutated copy; callers
// persist via the DBO.

import { DBO } from "@ursamu/ursamu";
import { executeRoll, type RollResult } from "../roller/execute.ts";
import {
  IMPRESSION_ORDER,
  type Impression,
  type LeverageEntry,
  type SocialManeuver,
} from "./types.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

export const maneuverDb = new DBO<SocialManeuver>("cofd.social-maneuvers");

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

export interface CreateManeuverInput {
  initiatorId: string;
  initiatorName: string;
  subjectId: string;
  subjectName: string;
  goal: string;
  /** Subject Resolve. */
  subjectResolve: number;
  /** Subject Composure. */
  subjectComposure: number;
  /** Optional starting impression. Defaults to "average". */
  impression?: Impression;
  /** Optional situational extra doors (Virtue conflict, Aspiration conflict, etc). */
  extraDoors?: number;
}

/** Doors base = min(Resolve, Composure). */
export function baseDoors(resolve: number, composure: number): number {
  const a = Math.max(1, Math.floor(resolve));
  const b = Math.max(1, Math.floor(composure));
  return Math.min(a, b);
}

export function buildManeuver(input: CreateManeuverInput): SocialManeuver {
  const now = Date.now();
  const base = baseDoors(input.subjectResolve, input.subjectComposure);
  const extra = Math.max(0, Math.floor(input.extraDoors ?? 0));
  return {
    id: `soc-${now}-${Math.floor(Math.random() * 1e6)}`,
    initiatorId: input.initiatorId,
    initiatorName: input.initiatorName,
    subjectId: input.subjectId,
    subjectName: input.subjectName,
    goal: input.goal,
    doorsTotal: base + extra,
    doorsOpen: 0,
    impression: input.impression ?? "average",
    penalty: 0,
    leverage: [],
    forced: false,
    resolved: false,
    immune: false,
    createdAt: now,
    updatedAt: now,
  };
}

/** Find the maneuver an initiator currently has open against a subject. */
export async function findActive(
  initiatorId: string,
  subjectId: string,
): Promise<SocialManeuver | null> {
  const all = await maneuverDb.find({} as Q);
  const m = all.find(
    (x: SocialManeuver) =>
      x.initiatorId === initiatorId &&
      x.subjectId === subjectId &&
      !x.resolved &&
      !x.immune,
  );
  return m ?? null;
}

/** List all of an initiator's active (unresolved) maneuvers. */
export async function listActive(
  initiatorId: string,
): Promise<SocialManeuver[]> {
  const all = await maneuverDb.find({} as Q);
  return all.filter(
    (x: SocialManeuver) =>
      x.initiatorId === initiatorId && !x.resolved && !x.immune,
  );
}

// ---------------------------------------------------------------------------
// Impression tier helpers
// ---------------------------------------------------------------------------

export function bumpImpressionUp(m: SocialManeuver): SocialManeuver {
  const idx = IMPRESSION_ORDER.indexOf(m.impression);
  const next = IMPRESSION_ORDER[Math.min(idx + 1, IMPRESSION_ORDER.length - 1)];
  return { ...m, impression: next, updatedAt: Date.now() };
}

export function bumpImpressionDown(m: SocialManeuver): SocialManeuver {
  const idx = IMPRESSION_ORDER.indexOf(m.impression);
  const next = IMPRESSION_ORDER[Math.max(idx - 1, 0)];
  return { ...m, impression: next, updatedAt: Date.now() };
}

export function setImpression(
  m: SocialManeuver,
  level: Impression,
): SocialManeuver {
  return { ...m, impression: level, updatedAt: Date.now() };
}

// ---------------------------------------------------------------------------
// Leverage
// ---------------------------------------------------------------------------

export interface SoftLeverageResult {
  maneuver: SocialManeuver;
  /** "door-removed" | "impression-up" | "no-effect". */
  effect: string;
}

/**
 * Soft Leverage (CoFD 2e p.81-82): aspiration knowledge removes a door
 * without a roll; vice tempts the subject and bumps impression up one;
 * gift/bribe also bumps impression up one. Cannot remove the last door
 * (the final door always requires a roll to open).
 */
export function applySoftLeverage(
  m: SocialManeuver,
  flavor: string,
  text: string,
): SoftLeverageResult {
  const now = Date.now();
  const f = flavor.toLowerCase().trim();
  if (m.resolved || m.immune) {
    return { maneuver: m, effect: "no-effect" };
  }
  // Aspiration: removes one door (cannot remove the last door).
  if (f === "aspiration") {
    const remaining = m.doorsTotal - m.doorsOpen;
    if (remaining <= 1) {
      // Bump impression instead so the leverage is not wasted.
      const bumped = bumpImpressionUp(m);
      const entry: LeverageEntry = {
        kind: "soft",
        flavor: f,
        text,
        doorsRemoved: 0,
        when: now,
      };
      return {
        maneuver: {
          ...bumped,
          leverage: [...bumped.leverage, entry],
          updatedAt: now,
        },
        effect: "impression-up",
      };
    }
    const entry: LeverageEntry = {
      kind: "soft",
      flavor: f,
      text,
      doorsRemoved: 1,
      when: now,
    };
    return {
      maneuver: {
        ...m,
        doorsOpen: m.doorsOpen + 1,
        leverage: [...m.leverage, entry],
        updatedAt: now,
      },
      effect: "door-removed",
    };
  }
  // Vice or gift/bribe: bump impression one step.
  const bumped = bumpImpressionUp(m);
  const entry: LeverageEntry = {
    kind: "soft",
    flavor: f || "gift",
    text,
    doorsRemoved: 0,
    when: now,
  };
  return {
    maneuver: {
      ...bumped,
      leverage: [...bumped.leverage, entry],
      updatedAt: now,
    },
    effect: "impression-up",
  };
}

export interface HardLeverageResult {
  maneuver: SocialManeuver;
  doorsRemoved: number;
}

/**
 * Hard Leverage (CoFD 2e p.83): threats, blackmail, drugging, kidnapping.
 * Removes 1 door normally; 2 if `severe` (the breaking-point modifier is
 * -3 or worse). Forces impression toward hostile (one step down) because
 * the relationship is burnt. ST may flag the maneuver "forced" via the
 * /force switch separately; hard leverage does NOT auto-force, but it
 * does taint the future of the relationship.
 */
export function applyHardLeverage(
  m: SocialManeuver,
  text: string,
  severe = false,
): HardLeverageResult {
  const now = Date.now();
  if (m.resolved || m.immune) {
    return { maneuver: m, doorsRemoved: 0 };
  }
  const remaining = m.doorsTotal - m.doorsOpen;
  const want = severe ? 2 : 1;
  const removed = Math.min(want, remaining);
  const entry: LeverageEntry = {
    kind: "hard",
    flavor: severe ? "severe" : "coercion",
    text,
    doorsRemoved: removed,
    when: now,
  };
  const bumped = bumpImpressionDown(m);
  return {
    maneuver: {
      ...bumped,
      doorsOpen: m.doorsOpen + removed,
      leverage: [...bumped.leverage, entry],
      updatedAt: now,
    },
    doorsRemoved: removed,
  };
}

// ---------------------------------------------------------------------------
// Opening doors
// ---------------------------------------------------------------------------

export interface DoorRollInput {
  /** Manipulation + Persuasion pool, pre-penalty. */
  pool: number;
  /** Subject resistance (Composure + Supernatural Tolerance, etc). */
  resistance: number;
}

export interface DoorRollResult {
  maneuver: SocialManeuver;
  /** "opened" | "failed" | "dramatic-fail" | "blocked" | "resolved". */
  outcome: string;
  doorsOpened: number;
  attacker: RollResult;
  defender: RollResult;
}

/**
 * Open Doors roll (CoFD 2e p.82). Contested Manipulation+Persuasion
 * (less cumulative penalty) vs Composure+ST.
 *
 * - Net successes >= 1 -> 1 door open. Exceptional (5+ net) -> 2 doors.
 * - Failure adds -1 cumulative penalty.
 * - Dramatic Failure: maneuver fails utterly, subject becomes immune.
 * - Hostile impression: cannot roll.
 *
 * Returns the mutated maneuver and the dice details.
 */
export function attemptDoor(
  m: SocialManeuver,
  input: DoorRollInput,
): DoorRollResult {
  if (m.resolved || m.immune) {
    return {
      maneuver: m,
      outcome: "blocked",
      doorsOpened: 0,
      // Empty placeholders so callers don't crash.
      attacker: emptyRoll(),
      defender: emptyRoll(),
    };
  }
  if (m.impression === "hostile") {
    return {
      maneuver: m,
      outcome: "blocked",
      doorsOpened: 0,
      attacker: emptyRoll(),
      defender: emptyRoll(),
    };
  }
  const effectivePool = Math.max(0, Math.floor(input.pool) - m.penalty);
  const atk = executeRoll(effectivePool);
  const def = executeRoll(Math.max(0, Math.floor(input.resistance)));
  const net = atk.successes - def.successes;

  if (atk.dramaticFailure) {
    // Failed utterly: subject is immune until next story.
    const updated: SocialManeuver = {
      ...m,
      immune: true,
      endReason: "dramatic-fail",
      penalty: m.penalty + 1,
      updatedAt: Date.now(),
    };
    return {
      maneuver: updated,
      outcome: "dramatic-fail",
      doorsOpened: 0,
      attacker: atk,
      defender: def,
    };
  }

  if (net <= 0) {
    const updated: SocialManeuver = {
      ...m,
      penalty: m.penalty + 1,
      updatedAt: Date.now(),
    };
    return {
      maneuver: updated,
      outcome: "failed",
      doorsOpened: 0,
      attacker: atk,
      defender: def,
    };
  }

  // 5+ net successes = exceptional: 2 doors. Else 1.
  const open = net >= 5 ? 2 : 1;
  const remaining = m.doorsTotal - m.doorsOpen;
  const opened = Math.min(open, remaining);
  const newOpen = m.doorsOpen + opened;
  const allOpen = newOpen >= m.doorsTotal;
  const updated: SocialManeuver = {
    ...m,
    doorsOpen: newOpen,
    resolved: allOpen,
    endReason: allOpen ? "resolved" : m.endReason,
    updatedAt: Date.now(),
  };
  return {
    maneuver: updated,
    outcome: allOpen ? "resolved" : "opened",
    doorsOpened: opened,
    attacker: atk,
    defender: def,
  };
}

/** Forcing Doors (CoFD 2e p.83) -- one-shot all-or-nothing roll. */
export interface ForceDoorsInput {
  pool: number;
  resistance: number;
}

export interface ForceDoorsResult {
  maneuver: SocialManeuver;
  outcome: "resolved" | "failed" | "blocked";
  attacker: RollResult;
  defender: RollResult;
}

export function forceDoors(
  m: SocialManeuver,
  input: ForceDoorsInput,
): ForceDoorsResult {
  if (m.resolved || m.immune) {
    return {
      maneuver: m,
      outcome: "blocked",
      attacker: emptyRoll(),
      defender: emptyRoll(),
    };
  }
  const remaining = m.doorsTotal - m.doorsOpen;
  const poolAfterDoorPenalty = Math.max(
    0,
    Math.floor(input.pool) - remaining - m.penalty,
  );
  const atk = executeRoll(poolAfterDoorPenalty);
  const def = executeRoll(Math.max(0, Math.floor(input.resistance)));
  const net = atk.successes - def.successes;
  if (net > 0) {
    return {
      maneuver: {
        ...m,
        doorsOpen: m.doorsTotal,
        resolved: true,
        forced: true,
        endReason: "forced",
        updatedAt: Date.now(),
      },
      outcome: "resolved",
      attacker: atk,
      defender: def,
    };
  }
  return {
    maneuver: {
      ...m,
      forced: true,
      immune: true,
      endReason: "force-fail",
      updatedAt: Date.now(),
    },
    outcome: "failed",
    attacker: atk,
    defender: def,
  };
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

export function abandonManeuver(m: SocialManeuver): SocialManeuver {
  return {
    ...m,
    immune: false,
    resolved: true,
    endReason: "abandoned",
    updatedAt: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

function emptyRoll(): RollResult {
  return {
    successes: 0,
    rolls: [],
    exceptional: false,
    dramaticFailure: false,
    isChanceDie: false,
    again: 10,
    rote: false,
  };
}
