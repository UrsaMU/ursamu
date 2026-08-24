/**
 * Keep legacy cpr.combat tracker and @ursamu/combat
 * EncounterStore (cpr.encounters) in sync.
 *
 * Round model:
 *   legacy combat.round  — 1-based (display)
 *   encounter.round      — 0-based (walker)
 * Never re-sort the queue when mapping indices — order must
 * match combat.queue so currentIndex === turnIdx.
 */
import type { Encounter, Participant } from "@ursamu/combat";
import type { ICombatActor, ICombatState } from
  "../../db/schemas.ts";
import {
  cprEncounterDb,
  cprEncounterStore,
  createCprEncounter,
} from "./ports.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

function actorToParticipant(
  a: ICombatActor,
): Participant {
  return {
    actorId: a.actorId,
    name: a.name,
    initiative: a.initiative,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: a.isNpc ? "npc" : "pc",
    actionUsed: a.acted === true,
    hasHold: a.held === true,
  };
}

/**
 * Push legacy combat → encounter (before walker).
 * Preserves queue order (already initiative-sorted).
 */
export async function syncEncounterFromCombat(
  combat: ICombatState,
): Promise<Encounter> {
  const roomId = combat.roomId;
  let enc = await cprEncounterStore.findInRoom?.(roomId) ??
    null;

  // Do NOT re-sort — currentIndex must match turnIdx
  const participants = combat.queue.map(actorToParticipant);

  if (!enc) {
    enc = await createCprEncounter(roomId, "FNFF");
  }

  const maxIdx = Math.max(0, participants.length - 1);
  const turnIdx = Math.min(
    Math.max(0, combat.currentIndex),
    maxIdx,
  );

  const updated: Encounter = {
    ...enc,
    roomId,
    status: combat.active ? "active" : "resolved",
    // legacy 1-based → encounter 0-based
    round: Math.max(0, (combat.round ?? 1) - 1),
    turnIdx,
    participants,
    startedBy: combat.startedBy,
    name: enc.name ?? "FNFF",
    meta: {
      ...(enc.meta ?? {}),
      legacyCombatId: combat.id,
    },
  };

  await cprEncounterDb.update(
    { id: enc.id } as Q,
    updated,
  );
  return updated;
}

/**
 * Pull encounter → legacy combat after walker runs.
 * Walker owns turnIdx/round during NPC turns; write back so
 * the next PC action advances from the correct slot/round.
 */
export function applyEncounterToCombat(
  combat: ICombatState,
  enc: Encounter,
): ICombatState {
  const cur = enc.participants[enc.turnIdx];
  let currentIndex = cur
    ? combat.queue.findIndex((a) => a.actorId === cur.actorId)
    : combat.currentIndex;
  if (currentIndex < 0) currentIndex = 0;

  // Keep queue names/init; mark acted from encounter
  const queue = combat.queue.map((a) => {
    const p = enc.participants.find(
      (x) => x.actorId === a.actorId,
    );
    if (!p) return a;
    return {
      ...a,
      acted: p.actionUsed === true,
      isNpc: p.kind === "npc" ? true : a.isNpc,
    };
  });

  return {
    ...combat,
    queue,
    currentIndex,
    // encounter 0-based → legacy 1-based
    round: Math.max(1, (enc.round ?? 0) + 1),
    active: enc.status === "active",
  };
}

export async function saveCombatFromEncounter(
  combat: ICombatState,
  enc: Encounter,
  // deno-lint-ignore no-explicit-any
  combatUpdate: (id: string, next: ICombatState) => Promise<any>,
): Promise<ICombatState> {
  const next = applyEncounterToCombat(combat, enc);
  await combatUpdate(next.id, next);
  return next;
}

/**
 * Ensure target is on the encounter when an attack starts.
 */
export async function ensureEncounterParticipant(
  roomId: string,
  actor: {
    actorId: string;
    name: string;
    initiative?: number;
    kind?: "pc" | "npc";
  },
): Promise<Encounter | null> {
  let enc = await cprEncounterStore.findInRoom?.(roomId) ??
    null;
  if (!enc) {
    enc = await createCprEncounter(roomId, "FNFF");
    enc = {
      ...enc,
      status: "active",
      participants: [],
    };
  }
  if (enc.participants.some((p) =>
    p.actorId === actor.actorId
  )) {
    if (enc.status !== "active") {
      const act = { ...enc, status: "active" as const };
      await cprEncounterDb.update({ id: enc.id } as Q, act);
      return act;
    }
    return enc;
  }
  const slot: Participant = {
    actorId: actor.actorId,
    name: actor.name,
    initiative: actor.initiative ?? 0,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: actor.kind ?? "pc",
  };
  const updated: Encounter = {
    ...enc,
    status: "active",
    participants: [...enc.participants, slot],
  };
  await cprEncounterDb.update({ id: enc.id } as Q, updated);
  return updated;
}

/** Mark participant out after mortal / KO. */
export async function markEncounterOut(
  roomId: string,
  actorId: string,
): Promise<void> {
  const enc = await cprEncounterStore.findInRoom?.(roomId);
  if (!enc) return;
  await cprEncounterStore.patchParticipant(
    enc.id,
    actorId,
    { isOut: true },
  );
}
