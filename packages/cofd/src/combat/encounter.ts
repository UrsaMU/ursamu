// CoFD 2e combat encounter management.
// Encounters are stored as DBO records in `cofd.encounters`.
// Pure ops accept the encounter object and return the mutated copy;
// each op then persists via the DBO API.

import { DBO, type IDBObj, type IUrsamuSDK } from "@ursamu/ursamu";
import type { CofdSheet } from "../stats/index.ts";
import type { Encounter, Participant } from "./types.ts";
import {
  isWeaponType,
  lookupItem,
  type WeaponEntry,
} from "../equipment/catalog.ts";
import { itemData } from "../equipment/objects.ts";
import { fastReflexesBonus } from "./modifiers.ts";

// ---------------------------------------------------------------------------
// DBO collection
// ---------------------------------------------------------------------------

// deno-lint-ignore no-explicit-any
type Q = any;

export const encounterDb = new DBO<Encounter>("cofd.encounters");

// ---------------------------------------------------------------------------
// Creation
// ---------------------------------------------------------------------------

/** Create a new encounter anchored to roomId. Status begins at "intent". */
export async function createEncounter(roomId: string): Promise<Encounter> {
  const now = Date.now();
  const enc: Encounter = {
    id: `enc-${now}-${Math.floor(Math.random() * 1e6)}`,
    roomId,
    round: 0,
    turnIdx: 0,
    participants: [],
    status: "intent",
    createdAt: now,
  };
  await encounterDb.create(enc);
  return enc;
}

// ---------------------------------------------------------------------------
// Participant management
// ---------------------------------------------------------------------------

/** Add an actor to an encounter. No-op if already present. */
export async function addParticipant(
  encounterId: string,
  actor: IDBObj,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (enc.participants.some((p) => p.actorId === actor.id)) return enc;
  // Pass 2: derive participant.kind from actor flags. NPC flag => "npc".
  const flags = actor.flags as Set<string> | undefined;
  const isNpc = !!(flags && typeof flags.has === "function" && flags.has("npc"));
  const updated: Encounter = {
    ...enc,
    participants: [
      ...enc.participants,
      {
        actorId: actor.id,
        name: actor.name ?? actor.id,
        initiative: 0,
        appliedDefense: 0,
        isDodging: false,
        isOut: false,
        kind: isNpc ? "npc" : "pc",
      },
    ],
  };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Remove an actor from an encounter. */
export async function removeParticipant(
  encounterId: string,
  actorId: string,
): Promise<{ encounter: Encounter; wasActive: boolean } | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const idx = enc.participants.findIndex((p) => p.actorId === actorId);
  if (idx < 0) return { encounter: enc, wasActive: false };

  const wasActive = enc.status === "active" && idx === enc.turnIdx;
  const participants = enc.participants.filter((p) => p.actorId !== actorId);

  // Adjust turnIdx after removal so the pointer stays on the same player.
  let turnIdx = enc.turnIdx;
  if (enc.status === "active") {
    if (idx < turnIdx) {
      turnIdx = Math.max(0, turnIdx - 1);
    } else if (turnIdx >= participants.length) {
      turnIdx = 0;
    }
  }

  const updated: Encounter = { ...enc, participants, turnIdx };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return { encounter: updated, wasActive };
}

/**
 * Add an actor to an encounter, rolling initiative and slotting them into the
 * order if the encounter is already active. No-op if already present.
 * Used for auto-join when an NPC is targeted/attacks mid-encounter, so the
 * command surface doesn't need explicit +combat/join for every NPC.
 */
export async function ensureParticipant(
  u: IUrsamuSDK,
  encounterId: string,
  actor: IDBObj,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (enc.participants.some((p) => p.actorId === actor.id)) return enc;

  const flags = actor.flags as Set<string> | undefined;
  const isNpc = !!(flags && typeof flags.has === "function" && flags.has("npc"));
  const base: Participant = {
    actorId: actor.id,
    name: actor.name ?? actor.id,
    initiative: 0,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: isNpc ? "npc" : "pc",
  };

  if (enc.status !== "active") {
    const updated: Encounter = { ...enc, participants: [...enc.participants, base] };
    await encounterDb.update({ id: encounterId } as Q, updated);
    return updated;
  }

  // Active encounter: roll initiative and insert sorted.
  const sheet = actor.state?.cofd as CofdSheet | undefined;
  const dex = sheet?.attributes?.dexterity ?? sheet?.attributes?.Dexterity ?? 1;
  const composure = sheet?.attributes?.composure ?? sheet?.attributes?.Composure ?? 1;
  let weaponMod = 0;
  const weaponId = sheet?.equipment?.equippedWeapon;
  if (weaponId) {
    const arr = await u.db.search({ id: weaponId } as Q);
    if (arr[0]) {
      const d = itemData(arr[0]);
      if (d) {
        const resolved = lookupItem(d.key);
        if (resolved && isWeaponType(resolved.type)) {
          weaponMod = (resolved.entry as WeaponEntry).initiative ?? 0;
        }
      }
    }
  }
  const reflexes = fastReflexesBonus(sheet);
  const initiative = roll1d10() + dex + composure + weaponMod + reflexes;
  const fresh: Participant = {
    ...base,
    initiative,
    actionUsed: false,
    delayed: false,
    ran: false,
    movedThisRound: false,
  };

  const ps = enc.participants;
  let insertAt = ps.length;
  for (let i = 0; i < ps.length; i++) {
    if (initiative > ps[i].initiative) { insertAt = i; break; }
  }
  const participants = [...ps.slice(0, insertAt), fresh, ...ps.slice(insertAt)];
  // Keep the current actor on their turn: if we inserted at/before them, bump.
  let turnIdx = enc.turnIdx;
  if (insertAt <= turnIdx) turnIdx += 1;
  const updated: Encounter = { ...enc, participants, turnIdx };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Initiative roll
// ---------------------------------------------------------------------------

/** Roll 1d10. Extracted for easy stubbing in tests. */
export function roll1d10(): number {
  return Math.floor(Math.random() * 10) + 1;
}

/**
 * Roll initiative for all non-out participants in the encounter.
 * Formula: 1d10 + Dexterity + Composure + weapon.initiative (if equipped).
 * Ties broken by Composure first, then Dexterity, then random.
 */
export async function rollInitiative(
  encounterId: string,
  u: IUrsamuSDK,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;

  const rolled: Participant[] = await Promise.all(
    enc.participants.map(async (p) => {
      const actors = await u.db.search({ id: p.actorId } as Q);
      const actor = actors[0];
      if (!actor) return { ...p, initiative: 0 };

      const sheet = actor.state?.cofd as CofdSheet | undefined;
      const dex = sheet?.attributes?.dexterity ?? sheet?.attributes?.Dexterity ?? 1;
      const composure = sheet?.attributes?.composure ?? sheet?.attributes?.Composure ?? 1;

      // Weapon initiative penalty: look up the equipped weapon in sheet.
      let weaponMod = 0;
      const weaponId = sheet?.equipment?.equippedWeapon;
      if (weaponId) {
        const weaponObjs = await u.db.search({ id: weaponId } as Q);
        if (weaponObjs[0]) {
          const d = itemData(weaponObjs[0]);
          if (d) {
            const resolved = lookupItem(d.key);
            if (resolved && isWeaponType(resolved.type)) {
              weaponMod = (resolved.entry as WeaponEntry).initiative ?? 0;
            }
          }
        }
      }

      const die = roll1d10();
      const reflexes = fastReflexesBonus(sheet);
      const initiative = die + dex + composure + weaponMod + reflexes;
      return {
        ...p,
        initiative,
        actionUsed: false,
        delayed: false,
        ran: false,
        movedThisRound: false,
        appliedDefense: 0,
      };
    }),
  );

  // Sort descending; ties: random tiebreak for simplicity.
  rolled.sort((a, b) => {
    if (b.initiative !== a.initiative) return b.initiative - a.initiative;
    return Math.random() - 0.5;
  });

  const updated: Encounter = {
    ...enc,
    participants: rolled,
    round: 1,
    turnIdx: 0,
    status: "active",
  };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
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
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
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
    }));
  } else {
    // Clear the per-turn action-economy flags for the actor about to act.
    participants = participants.map((p, i) =>
      i === nextIdx ? { ...p, actionUsed: false, ran: false } : p
    );
  }

  // Loop to handle surprise skip
  let surpriseSafety = count * 2;
  while (participants[nextIdx] && participants[nextIdx].surprised && surpriseSafety-- > 0) {
    const surprisedName = participants[nextIdx].name;
    if (u && typeof u.broadcast === "function") {
      u.broadcast(`%cy${surprisedName} is surprised and loses their turn!%cn`);
    }
    // Mark actionUsed: true, ran: false, surprised: false on the surprised participant
    participants = participants.map((p, i) =>
      i === nextIdx ? { ...p, actionUsed: true, ran: false, surprised: false } : p
    );

    // Now advance past them!
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

    // Skip delayed actors after advancing
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

  const updated: Encounter = { ...enc, participants, round, turnIdx: nextIdx };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

// ---------------------------------------------------------------------------
// Per-turn flags
// ---------------------------------------------------------------------------

/** Increment appliedDefense for a participant (called each time they are attacked). */
export async function applyDefense(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, appliedDefense: p.appliedDefense + 1 } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set or clear the dodge flag for a participant. */
export async function setDodge(
  encounterId: string,
  actorId: string,
  dodging: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, isDodging: dodging } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
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
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (!enc.participants.some((p) => p.actorId === actorId)) return null;
  const v = clamp03(value);
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, cover: v } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set the concealment level for a participant. Clamped to 0..3. */
export async function setParticipantConcealment(
  encounterId: string,
  actorId: string,
  value: number,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (!enc.participants.some((p) => p.actorId === actorId)) return null;
  const v = clamp03(value);
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, concealment: v } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/**
 * Apply a "pinned by" marker to every participant other than the suppressor.
 * Used by +attack/suppress (autofire burst-long with no damage).
 */
export async function applySuppression(
  encounterId: string,
  suppressorId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === suppressorId ? p : { ...p, pinnedBy: suppressorId }
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Clear the pin on a single participant. */
export async function clearPin(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, pinnedBy: undefined } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set or clear the Beaten Down flag for a participant. */
export async function setBeatenDown(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, beatenDown: value } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
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
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, ...state } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Clear all grapple state flags on a participant in the encounter. */
export async function clearParticipantGrappleState(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId
      ? {
          ...p,
          hasHold: undefined,
          hasControl: undefined,
          isRestrained: undefined,
          isUsingAsCover: undefined,
        }
      : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set or clear the surprised flag for a participant. */
export async function setSurprised(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, surprised: value } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set or clear surrender on a participant. */
export async function setSurrendered(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, surrendered: value } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set or clear the actionUsed flag for a participant. */
export async function setActionUsed(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, actionUsed: value } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Set the ran (sprint) flag for a participant. Also consumes the instant slot. */
export async function setRan(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId
      ? { ...p, ran: value, movedThisRound: value ? true : p.movedThisRound, actionUsed: value ? true : p.actionUsed }
      : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/**
 * Mark the current actor as Delayed (held action) and advance past them.
 * Returns { encounter, advanced } where advanced is the post-advance state.
 */
export async function delayCurrent(
  encounterId: string,
): Promise<{ encounter: Encounter; delayedActorId: string | null } | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc || enc.status !== "active") return null;
  if (enc.participants.length === 0) return null;
  const cur = enc.participants[enc.turnIdx];
  if (!cur) return null;
  const participants = enc.participants.map((p, i) =>
    i === enc.turnIdx ? { ...p, delayed: true } : p
  );
  const mid: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, mid);
  const advanced = await advanceTurn(encounterId);
  return { encounter: advanced ?? mid, delayedActorId: cur.actorId };
}

/**
 * A delayed participant reclaims their action. We point turnIdx at them and
 * clear the delayed flag so the order resumes from their seat next.
 * Returns null if the actor isn't delayed.
 */
export async function reclaimDelayed(
  encounterId: string,
  actorId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc || enc.status !== "active") return null;
  const idx = enc.participants.findIndex((p) => p.actorId === actorId);
  if (idx < 0) return null;
  if (!enc.participants[idx].delayed) return null;
  const participants = enc.participants.map((p, i) =>
    i === idx ? { ...p, delayed: false, actionUsed: false, ran: false } : p
  );
  const updated: Encounter = { ...enc, participants, turnIdx: idx };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

/** Mark a participant as having used their movement this round. */
export async function setMoved(
  encounterId: string,
  actorId: string,
  value: boolean,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, movedThisRound: value } : p
  );
  const updated: Encounter = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
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
  const results = await encounterDb.find({ roomId } as Q);
  const live = results.filter((e) => e.status !== "resolved");
  return live[0] ?? null;
}
