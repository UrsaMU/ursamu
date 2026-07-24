/**
 * Engine-owned initiative: roll via ports, sort, activate.
 * Game systems only supply ports.rollInitiative(actorId).
 */
import type { Encounter, Participant } from "./types.ts";
import type { CombatPorts } from "./ports.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";

export interface ActivateOptions {
  ports: CombatPorts;
  store?: EncounterStore;
  /** Tie-break RNG; default Math.random. */
  rng?: () => number;
}

/** Sort highest initiative first; ties broken by rng. */
export function sortByInitiative(
  participants: readonly Participant[],
  rng: () => number = Math.random,
): Participant[] {
  const copy = [...participants];
  copy.sort((a, b) => {
    if (b.initiative !== a.initiative) {
      return b.initiative - a.initiative;
    }
    return rng() - 0.5;
  });
  return copy;
}

/**
 * Roll initiative for every participant via ports, reset turn flags.
 * Does not persist or change status — caller activates.
 */
export async function rollAllInitiatives(
  participants: readonly Participant[],
  ports: CombatPorts,
): Promise<Participant[]> {
  const roll = ports.rollInitiative ??
    (async () => 0);
  return await Promise.all(
    participants.map(async (p) => {
      if (p.isOut) {
        return {
          ...p,
          initiative: p.initiative,
          actionUsed: false,
          delayed: false,
          ran: false,
          movedThisRound: false,
          appliedDefense: 0,
        };
      }
      const initiative = await roll(p.actorId);
      return {
        ...p,
        initiative,
        actionUsed: false,
        delayed: false,
        ran: false,
        movedThisRound: false,
        appliedDefense: 0,
        isDodging: false,
      };
    }),
  );
}

/**
 * Roll all initiatives, sort, set status=active, round=1, turnIdx=0.
 */
export async function activateEncounter(
  encounterId: string,
  options: ActivateOptions,
): Promise<Encounter | null> {
  const store = options.store ?? getEncounterStore();
  const rng = options.rng ?? Math.random;
  const enc = await store.get(encounterId);
  if (!enc) return null;

  const rolled = await rollAllInitiatives(
    enc.participants,
    options.ports,
  );
  const sorted = sortByInitiative(rolled, rng);
  const updated: Encounter = {
    ...enc,
    participants: sorted,
    round: 1,
    turnIdx: 0,
    status: "active",
  };
  await store.save(updated);
  return updated;
}

export interface JoinActiveOptions extends ActivateOptions {
  /** Base participant fields (initiative filled by roll). */
  participant: Omit<
    Participant,
    | "initiative"
    | "appliedDefense"
    | "isDodging"
    | "isOut"
  > &
    Partial<Participant>;
}

/**
 * Join an already-active encounter: roll init, insert sorted,
 * bump turnIdx if inserted at/before current.
 */
export async function joinActiveEncounter(
  encounterId: string,
  options: JoinActiveOptions,
): Promise<Encounter | null> {
  const store = options.store ?? getEncounterStore();
  const enc = await store.get(encounterId);
  if (!enc) return null;
  if (enc.participants.some((p) =>
    p.actorId === options.participant.actorId
  )) {
    return enc;
  }

  const roll = options.ports.rollInitiative ??
    (async () => 0);
  const initiative = await roll(options.participant.actorId);
  const fresh: Participant = {
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: "pc",
    ...options.participant,
    initiative,
    actionUsed: false,
    delayed: false,
    ran: false,
    movedThisRound: false,
  };

  const ps = enc.participants;
  let insertAt = ps.length;
  for (let i = 0; i < ps.length; i++) {
    if (initiative > ps[i].initiative) {
      insertAt = i;
      break;
    }
  }
  const participants = [
    ...ps.slice(0, insertAt),
    fresh,
    ...ps.slice(insertAt),
  ];
  let turnIdx = enc.turnIdx;
  if (insertAt <= turnIdx) turnIdx += 1;

  const updated: Encounter = {
    ...enc,
    participants,
    turnIdx,
  };
  await store.save(updated);
  return updated;
}
