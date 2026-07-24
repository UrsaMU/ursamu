/**
 * Generic encounter lifecycle — create / join / leave / begin / end / next.
 * Host commands become thin UX over these helpers + system ports.
 */
import type { Encounter, Participant } from "./types.ts";
import type { CombatPorts } from "./ports.ts";
import {
  getEncounterStore,
  type EncounterStore,
} from "./store.ts";
import {
  activateEncounter,
  joinActiveEncounter,
} from "./initiative.ts";

export interface LifecycleOptions {
  store?: EncounterStore;
}

export interface BeginOptions extends LifecycleOptions {
  ports: CombatPorts;
  rng?: () => number;
}

function storeOf(opts?: LifecycleOptions): EncounterStore {
  return opts?.store ?? getEncounterStore();
}

function newEncounterId(): string {
  const now = Date.now();
  return `enc-${now}-${Math.floor(Math.random() * 1e6)}`;
}

/** Create an intent-phase encounter in a room. */
export async function startEncounter(
  roomId: string,
  opts?: LifecycleOptions & {
    name?: string;
    id?: string;
    startedBy?: string;
  },
): Promise<Encounter> {
  const store = storeOf(opts);
  const enc: Encounter = {
    id: opts?.id ?? newEncounterId(),
    roomId,
    round: 0,
    turnIdx: 0,
    participants: [],
    status: "intent",
    createdAt: Date.now(),
    name: opts?.name,
    startedBy: opts?.startedBy,
    log: [],
  };
  await store.create(enc);
  return enc;
}

/** Find intent/active encounter in room (prefer active). */
export async function findRoomEncounter(
  roomId: string,
  opts?: LifecycleOptions,
): Promise<Encounter | null> {
  const store = storeOf(opts);
  if (store.findInRoom) return await store.findInRoom(roomId);
  return null;
}

export type JoinParticipant = Omit<
  Participant,
  "initiative" | "appliedDefense" | "isDodging" | "isOut"
> &
  Partial<Participant>;

/**
 * Add participant. If encounter is already active and ports provided,
 * rolls initiative and inserts sorted.
 */
export async function joinEncounter(
  encounterId: string,
  participant: JoinParticipant,
  opts?: LifecycleOptions & { ports?: CombatPorts },
): Promise<Encounter | null> {
  const store = storeOf(opts);
  const enc = await store.get(encounterId);
  if (!enc) return null;
  if (enc.participants.some((p) =>
    p.actorId === participant.actorId
  )) {
    return enc;
  }

  if (enc.status === "active" && opts?.ports) {
    return await joinActiveEncounter(encounterId, {
      ports: opts.ports,
      store,
      participant,
    });
  }

  const slot: Participant = {
    initiative: 0,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
    kind: "pc",
    ...participant,
    actorId: participant.actorId,
    name: participant.name,
  };
  const updated: Encounter = {
    ...enc,
    participants: [...enc.participants, slot],
  };
  await store.save(updated);
  return updated;
}

/** Remove participant; adjust turnIdx if active. */
export async function leaveEncounter(
  encounterId: string,
  actorId: string,
  opts?: LifecycleOptions,
): Promise<{ encounter: Encounter; wasActive: boolean } | null> {
  const store = storeOf(opts);
  const enc = await store.get(encounterId);
  if (!enc) return null;
  const idx = enc.participants.findIndex((p) => p.actorId === actorId);
  if (idx < 0) return { encounter: enc, wasActive: false };

  const wasActive = enc.status === "active" && idx === enc.turnIdx;
  const participants = enc.participants.filter(
    (p) => p.actorId !== actorId,
  );

  let turnIdx = enc.turnIdx;
  if (enc.status === "active") {
    if (idx < turnIdx) turnIdx = Math.max(0, turnIdx - 1);
    else if (turnIdx >= participants.length) turnIdx = 0;
  }

  const updated: Encounter = { ...enc, participants, turnIdx };
  await store.save(updated);
  return { encounter: updated, wasActive };
}

/** Roll initiative + activate (status=active). */
export async function beginEncounter(
  encounterId: string,
  opts: BeginOptions,
): Promise<Encounter | null> {
  return await activateEncounter(encounterId, {
    ports: opts.ports,
    store: storeOf(opts),
    rng: opts.rng,
  });
}

/** Mark encounter resolved (host handles loot/beats via onResolved). */
export async function endEncounter(
  encounterId: string,
  opts?: LifecycleOptions,
): Promise<Encounter | null> {
  const store = storeOf(opts);
  const enc = await store.get(encounterId);
  if (!enc) return null;
  if (enc.status === "resolved") return enc;
  const updated: Encounter = { ...enc, status: "resolved" };
  await store.save(updated);
  return updated;
}

/** Advance one turn (no AI). */
export async function nextTurn(
  encounterId: string,
  opts?: LifecycleOptions,
): Promise<Encounter | null> {
  return await storeOf(opts).advanceTurn(encounterId);
}
