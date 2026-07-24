// CoFD 2e combat encounter management.
// Encounters are stored as DBO records in `cofd.encounters`.
// Pure ops accept the encounter object and return the mutated copy;
// each op then persists via the DBO API.

import {
  beginEncounter,
  endEncounter,
  findRoomEncounter,
  joinEncounter,
  leaveEncounter,
  nextTurn,
  startEncounter,
  type CombatPorts,
  type EncounterStore,
} from "@ursamu/combat";
import { DBO, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import type { Encounter, Participant } from "./types.ts";
import { computeCofdInitiative } from "./initiative.ts";

export { roll1d10 } from "./initiative.ts";

// ---------------------------------------------------------------------------
// DBO collection
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Q = any;

export const encounterDb = new DBO<Encounter>("cofd.encounters");

/** EncounterStore over cofd.encounters (shared with ports / walker). */
export const cofdEncounterStore: EncounterStore = {
  async get(id) {
    return (await encounterDb.findOne({ id } as Q)) ?? null;
  },
  async create(enc) {
    await encounterDb.create(enc);
  },
  async save(enc) {
    await encounterDb.update({ id: enc.id } as Q, enc);
  },
  async findInRoom(roomId) {
    const rows = await encounterDb.query({
      roomId,
      status: { $in: ["intent", "active"] },
    } as Q);
    if (!rows.length) return null;
    return (
      rows.find((e) => e.status === "active") ?? rows[0] ?? null
    );
  },
  async advanceTurn(id) {
    return await advanceTurn(id);
  },
  async patchParticipant(encounterId, actorId, patch) {
    const { patchParticipant } = await import("./resolution.ts");
    return await patchParticipant(encounterId, actorId, patch);
  },
};

/** All mutators read/write only through the store (not raw DBO). */
async function loadEnc(id: string): Promise<Encounter | null> {
  return await cofdEncounterStore.get(id);
}

async function saveEnc(enc: Encounter): Promise<void> {
  await cofdEncounterStore.save(enc);
}

/**
 * Map one participant and save. If require and actor missing → null.
 * If !require and actor missing → enc unchanged (no write).
 */
async function mapOne(
  encounterId: string,
  actorId: string,
  fn: (p: Participant) => Participant,
  require = false,
): Promise<Encounter | null> {
  const enc = await loadEnc(encounterId);
  if (!enc) return null;
  const found = enc.participants.some((p) => p.actorId === actorId);
  if (!found) return require ? null : enc;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? fn(p) : p
  );
  const updated: Encounter = { ...enc, participants };
  await saveEnc(updated);
  return updated;
}

/** Ports stub with only rollInitiative — enough for activate/join. */
function initiativePorts(u: IUrsamuSDK): CombatPorts {
  return {
    loadActor: () => Promise.resolve(null),
    executeAction: () => Promise.resolve({ ok: true }),
    broadcast: () => {},
    rollInitiative: (actorId) => computeCofdInitiative(u, actorId),
  };
}

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Create a new encounter anchored to roomId. Status begins at "intent". */
export async function createEncounter(roomId: string): Promise<Encounter> {
  return await startEncounter(roomId, { store: cofdEncounterStore });
}

// ---------------------------------------------------------------------------
// Participant management
// ---------------------------------------------------------------------------

function kindOf(actor: IDBObj): "pc" | "npc" {
  const flags = actor.flags as Set<string> | undefined;
  const isNpc = !!(
    flags && typeof flags.has === "function" && flags.has("npc")
  );
  return isNpc ? "npc" : "pc";
}

/** Add an actor to an encounter. No-op if already present. */
export async function addParticipant(
  encounterId: string,
  actor: IDBObj,
): Promise<Encounter | null> {
  return await joinEncounter(
    encounterId,
    {
      actorId: actor.id,
      name: actor.name ?? actor.id,
      kind: kindOf(actor),
    },
    { store: cofdEncounterStore },
  );
}

/** Remove an actor from an encounter. */
export async function removeParticipant(
  encounterId: string,
  actorId: string,
): Promise<{ encounter: Encounter; wasActive: boolean } | null> {
  return await leaveEncounter(encounterId, actorId, {
    store: cofdEncounterStore,
  });
}

/**
 * Add an actor to an encounter, rolling initiative and slotting them into the
 * order if the encounter is already active. No-op if already present.
 */
export async function ensureParticipant(
  u: IUrsamuSDK,
  encounterId: string,
  actor: IDBObj,
): Promise<Encounter | null> {
  return await joinEncounter(
    encounterId,
    {
      actorId: actor.id,
      name: actor.name ?? actor.id,
      kind: kindOf(actor),
    },
    {
      store: cofdEncounterStore,
      ports: initiativePorts(u),
    },
  );
}

// ---------------------------------------------------------------------------
// Initiative roll
// ---------------------------------------------------------------------------

/**
 * Roll initiative for all participants and activate the encounter.
 * Formula is CofD (ports.rollInitiative); sort/activate is @ursamu/combat.
 */
export async function rollInitiative(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  return await beginEncounter(encounterId, {
    ports: initiativePorts(u),
    store: cofdEncounterStore,
  });
}

/** @deprecated use computeCofdInitiative from ./initiative.ts */
export async function rollActorInitiative(
  u: IUrsamuSDK,
  actorId: string,
): Promise<number> {
  return await computeCofdInitiative(u, actorId);
}

// ---------------------------------------------------------------------------
// Turn management
// ---------------------------------------------------------------------------

/**
 * Advance the turn pointer.
 * When it wraps past the last participant, increment round and reset
 * every appliedDefense and isDodging to 0/false.
 */
export async function advanceTurn(
  encounterId: string,
  u?: IUrsamuSDK,
): Promise<Encounter | null> {
  const enc = await loadEnc(encounterId);
  if (!enc || enc.status !== "active") return enc ?? null;

  const count = enc.participants.length;
  if (count === 0) return enc;

  let nextIdx = enc.turnIdx + 1;
  let round = enc.round;
  let participants = enc.participants;

  // Skip past any delayed actors (held action -- they re-enter via reclaim).
  let safety = count + 1;
  while (
    safety-- > 0 &&
    nextIdx < count &&
    participants[nextIdx] &&
    participants[nextIdx].delayed
  ) {
    nextIdx += 1;
  }

  if (nextIdx >= count) {
    nextIdx = 0;
    round += 1;
    // Reset per-round Defense, dodge, pin, movement, and action-economy state.
    participants = participants.map((p) => ({
      ...p,
      appliedDefense: 0,
      isDodging: false,
      pinnedBy: undefined,
      movedThisRound: false,
      actionUsed: false,
      delayed: false,
      ran: false,
      spentEnergy: 0,
    }));
  } else {
    // Clear the per-turn action-economy flags for the actor about to act.
    participants = participants.map((p, i) =>
      i === nextIdx
        ? { ...p, actionUsed: false, ran: false, spentEnergy: 0 }
        : p
    );
  }

  // Loop to handle surprise skip
  let surpriseSafety = count * 2;
  while (
    participants[nextIdx] &&
    participants[nextIdx].surprised &&
    surpriseSafety-- > 0
  ) {
    const surprisedName = participants[nextIdx].name;
    if (u && typeof u.broadcast === "function") {
      u.broadcast(
        `%cy${surprisedName} is surprised and loses their turn!%cn`,
      );
    }
    participants = participants.map((p, i) =>
      i === nextIdx
        ? { ...p, actionUsed: true, ran: false, surprised: false }
        : p
    );

    nextIdx += 1;
    if (nextIdx >= count) {
      nextIdx = 0;
      round += 1;
      participants = participants.map((p) => ({
        ...p,
        appliedDefense: 0,
        isDodging: false,
        pinnedBy: undefined,
        movedThisRound: false,
        actionUsed: false,
        delayed: false,
        ran: false,
      }));
    } else {
      participants = participants.map((p, i) =>
        i === nextIdx ? { ...p, actionUsed: false, ran: false } : p
      );
    }

    let delaySafety = count + 1;
    while (
      delaySafety-- > 0 &&
      nextIdx < count &&
      participants[nextIdx] &&
      participants[nextIdx].delayed
    ) {
      nextIdx += 1;
    }
    if (nextIdx >= count) {
      nextIdx = 0;
      round += 1;
      participants = participants.map((p) => ({
        ...p,
        appliedDefense: 0,
        isDodging: false,
        pinnedBy: undefined,
        movedThisRound: false,
        actionUsed: false,
        delayed: false,
        ran: false,
      }));
    } else {
      participants = participants.map((p, i) =>
        i === nextIdx ? { ...p, actionUsed: false, ran: false } : p
      );
    }
  }

  const updated: Encounter = {
    ...enc,
    participants,
    round,
    turnIdx: nextIdx,
  };
  await saveEnc(updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Per-turn flags (all writes via cofdEncounterStore)
// ---------------------------------------------------------------------------

/** Increment appliedDefense for a participant (each time they are attacked). */
export async function applyDefense(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    appliedDefense: p.appliedDefense + 1,
  }));
}

/** Set or clear the dodge flag for a participant. */
export async function setDodge(
  encounterId: string,
  actorId: string,
  dodging: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    isDodging: dodging,
  }));
}

/** Clamp a cover/concealment value to 0..3. Negative/NaN coerce to 0. */
function clamp03(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 3) return 3;
  return Math.floor(n);
}

/** Set the cover Durability for a participant. Clamped to 0..3. */
export async function setParticipantCover(
  encounterId: string,
  actorId: string,
  value: number,
): Promise<Encounter | null> {
  const v = clamp03(value);
  return await mapOne(
    encounterId,
    actorId,
    (p) => ({ ...p, cover: v }),
    true,
  );
}

/** Set the concealment level for a participant. Clamped to 0..3. */
export async function setParticipantConcealment(
  encounterId: string,
  actorId: string,
  value: number,
): Promise<Encounter | null> {
  const v = clamp03(value);
  return await mapOne(
    encounterId,
    actorId,
    (p) => ({ ...p, concealment: v }),
    true,
  );
}

/**
 * Apply a "pinned by" marker to every participant other than the suppressor.
 * Used by +attack/suppress (autofire burst-long with no damage).
 */
export async function applySuppression(
  encounterId: string,
  suppressorId: string,
): Promise<Encounter | null> {
  const enc = await loadEnc(encounterId);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === suppressorId ? p : { ...p, pinnedBy: suppressorId }
  );
  const updated: Encounter = { ...enc, participants };
  await saveEnc(updated);
  return updated;
}

/** Clear the pin on a single participant. */
export async function clearPin(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    pinnedBy: undefined,
  }));
}

/** Set or clear the Beaten Down flag for a participant. */
export async function setBeatenDown(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    beatenDown: value,
  }));
}

/** Set or clear grapple state flags on a participant in the encounter. */
export async function setParticipantGrappleState(
  encounterId: string,
  actorId: string,
  state: {
    hasHold?: boolean;
    hasControl?: boolean;
    isRestrained?: boolean;
    isUsingAsCover?: boolean;
  },
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({ ...p, ...state }));
}

/** Clear all grapple state flags on a participant in the encounter. */
export async function clearParticipantGrappleState(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    hasHold: undefined,
    hasControl: undefined,
    isRestrained: undefined,
    isUsingAsCover: undefined,
  }));
}

/** Set or clear the surprised flag for a participant. */
export async function setSurprised(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    surprised: value,
  }));
}

/** Set or clear surrender on a participant. */
export async function setSurrendered(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    surrendered: value,
  }));
}

/** Set or clear the actionUsed flag for a participant. */
export async function setActionUsed(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    actionUsed: value,
  }));
}

/** Set the ran (sprint) flag. Also consumes the instant slot. */
export async function setRan(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    ran: value,
    movedThisRound: value ? true : p.movedThisRound,
    actionUsed: value ? true : p.actionUsed,
  }));
}

/**
 * Mark the current actor as Delayed (held action) and advance past them.
 * Returns { encounter, advanced } where advanced is the post-advance state.
 */
export async function delayCurrent(
  encounterId: string,
): Promise<{ encounter: Encounter; delayedActorId: string | null } | null> {
  const enc = await loadEnc(encounterId);
  if (!enc || enc.status !== "active") return null;
  if (enc.participants.length === 0) return null;
  const cur = enc.participants[enc.turnIdx];
  if (!cur) return null;
  const participants = enc.participants.map((p, i) =>
    i === enc.turnIdx ? { ...p, delayed: true } : p
  );
  const mid: Encounter = { ...enc, participants };
  await saveEnc(mid);
  const advanced = await advanceTurn(encounterId);
  return { encounter: advanced ?? mid, delayedActorId: cur.actorId };
}

/**
 * A delayed participant reclaims their action. Point turnIdx at them and
 * clear delayed so the order resumes from their seat next.
 * Returns null if the actor isn't delayed.
 */
export async function reclaimDelayed(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  const enc = await loadEnc(encounterId);
  if (!enc || enc.status !== "active") return null;
  const idx = enc.participants.findIndex((p) => p.actorId === actorId);
  if (idx < 0) return null;
  if (!enc.participants[idx].delayed) return null;
  const participants = enc.participants.map((p, i) =>
    i === idx
      ? { ...p, delayed: false, actionUsed: false, ran: false }
      : p
  );
  const updated: Encounter = { ...enc, participants, turnIdx: idx };
  await saveEnc(updated);
  return updated;
}

/** Mark a participant as having used their movement this round. */
export async function setMoved(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    movedThisRound: value,
  }));
}

/** Add to a participant's spentEnergy this turn (Glamour spend tracking). */
export async function addSpentEnergy(
  encounterId: string,
  actorId: string,
  amount: number,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    spentEnergy: (p.spentEnergy ?? 0) + amount,
  }));
}

/** Spike or set threat[targetId] on a participant (staff NPC tools). */
export async function setParticipantThreat(
  encounterId: string,
  actorId: string,
  targetId: string,
  value: number,
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    threat: { ...(p.threat ?? {}), [targetId]: value },
  }));
}

/** Set reaction posture on a participant. */
export async function setReactionPosture(
  encounterId: string,
  actorId: string,
  posture: Participant["reactionPosture"],
): Promise<Encounter | null> {
  return await mapOne(encounterId, actorId, (p) => ({
    ...p,
    reactionPosture: posture,
  }));
}

/** Patch encounter-level fields (e.g. maxRounds) and save. */
export async function patchEncounter(
  encounterId: string,
  patch: Partial<Encounter>,
): Promise<Encounter | null> {
  const enc = await loadEnc(encounterId);
  if (!enc) return null;
  const updated: Encounter = { ...enc, ...patch, id: enc.id };
  await saveEnc(updated);
  return updated;
}

/** Compute Speed from a sheet: Strength + Dexterity + Size (default 5). */
export function computeSpeed(sheet: {
  attributes?: Record<string, number>;
  advantages?: { size?: number };
} | null | undefined): number {
  if (!sheet) return 5;
  const attrs = sheet.attributes ?? {};
  const str = (attrs.strength ?? attrs.Strength ?? 1) as number;
  const dex = (attrs.dexterity ?? attrs.Dexterity ?? 1) as number;
  const size = sheet.advantages?.size ?? 5;
  return str + dex + size;
}

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Pure predicate: should this actor be blocked from leaving an encounter room?
 * Blocks when the encounter is active, the actor is a participant, and the
 * actor does not carry an admin/wizard flag.
 */
export function shouldBlockMove(
  encounter: Encounter | null | undefined,
  actorId: string,
  actorFlags: Iterable<string>,
): boolean {
  if (!encounter || encounter.status !== "active") return false;
  if (!encounter.participants.some((p) => p.actorId === actorId)) return false;
  const flagSet = new Set(actorFlags);
  if (flagSet.has("admin") || flagSet.has("wizard")) return false;
  return true;
}

/** Return the active (non-resolved) encounter for a room, or null. */
export async function getEncounterForRoom(
  roomId: string,
): Promise<Encounter | null> {
  return await findRoomEncounter(roomId, {
    store: cofdEncounterStore,
  });
}

/** Return the glamour spending limit per turn based on Changeling Wyrd (powerStatValue). */
export function glamourSpendLimit(wyrd: number): number {
  const w = Math.max(1, Math.min(10, Math.floor(wyrd)));
  const limits: Record<number, number> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: 7,
    8: 8,
    9: 10,
    10: 15,
  };
  return limits[w] ?? 1;
}

