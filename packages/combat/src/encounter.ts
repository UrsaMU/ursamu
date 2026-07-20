/**
 * Encounter store — system-agnostic DBO collection.
 * Initiative formulas stay in the host system (ports / plugin).
 */
import { DBO } from "@ursamu/mush";
import type { Encounter, Participant } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

/** Shared encounter collection (not cofd.*). */
export const encounterDb = new DBO<Encounter>("combat.encounters");

export async function createEncounter(
  roomId: string,
  name?: string,
): Promise<Encounter> {
  const now = Date.now();
  const enc: Encounter = {
    id: `enc-${now}-${Math.floor(Math.random() * 1e6)}`,
    roomId,
    round: 0,
    turnIdx: 0,
    participants: [],
    status: "intent",
    createdAt: now,
    name,
  };
  await encounterDb.create(enc);
  return enc;
}

export async function getEncounter(
  encounterId: string,
): Promise<Encounter | null> {
  return (await encounterDb.findOne({ id: encounterId } as Q)) ??
    null;
}

export async function getEncounterForRoom(
  roomId: string,
): Promise<Encounter | null> {
  const rows = await encounterDb.query({
    roomId,
    status: { $in: ["intent", "active"] },
  } as Q);
  if (!rows.length) return null;
  // Prefer active over intent.
  return (
    rows.find((e) => e.status === "active") ?? rows[0] ?? null
  );
}

export async function addParticipant(
  encounterId: string,
  p: Omit<
    Participant,
    | "initiative"
    | "appliedDefense"
    | "isDodging"
    | "isOut"
  > & Partial<Participant>,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  if (enc.participants.some((x) => x.actorId === p.actorId)) {
    return enc;
  }
  const slot: Participant = {
    ...p,
    actorId: p.actorId,
    name: p.name,
    initiative: p.initiative ?? 0,
    appliedDefense: p.appliedDefense ?? 0,
    isDodging: p.isDodging ?? false,
    isOut: p.isOut ?? false,
    kind: p.kind ?? "pc",
  };
  const updated: Encounter = {
    ...enc,
    participants: [...enc.participants, slot],
  };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

export async function patchParticipant(
  encounterId: string,
  actorId: string,
  patch: Partial<Participant>,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc) return null;
  const participants = enc.participants.map((p) =>
    p.actorId === actorId ? { ...p, ...patch } : p
  );
  const updated = { ...enc, participants };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

export async function setEncounter(
  enc: Encounter,
): Promise<Encounter> {
  await encounterDb.update({ id: enc.id } as Q, enc);
  return enc;
}

/**
 * Advance turn pointer. On wrap: new round, reset defense/dodge flags.
 */
export async function advanceTurn(
  encounterId: string,
): Promise<Encounter | null> {
  const enc = await encounterDb.findOne({ id: encounterId } as Q);
  if (!enc || enc.status !== "active") return enc ?? null;

  const count = enc.participants.length;
  if (count === 0) return enc;

  let nextIdx = enc.turnIdx + 1;
  let round = enc.round;
  let participants = enc.participants;

  let safety = count + 1;
  while (
    safety-- > 0 &&
    nextIdx < count &&
    participants[nextIdx]?.delayed
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
      actionUsed: false,
      movedThisRound: false,
      ran: false,
      delayed: false,
    }));
    // Skip delayed at start of round.
    safety = count + 1;
    while (
      safety-- > 0 &&
      participants[nextIdx]?.delayed
    ) {
      nextIdx = (nextIdx + 1) % count;
      if (nextIdx === 0) break;
    }
  }

  const updated: Encounter = {
    ...enc,
    turnIdx: nextIdx,
    round,
    participants,
  };
  await encounterDb.update({ id: encounterId } as Q, updated);
  return updated;
}

export function allNpcsDown(enc: Encounter): boolean {
  const npcs = enc.participants.filter((p) => p.kind === "npc");
  if (npcs.length === 0) return false;
  return npcs.every((p) => p.isOut);
}

export function currentParticipant(
  enc: Encounter,
): Participant | null {
  return enc.participants[enc.turnIdx] ?? null;
}
