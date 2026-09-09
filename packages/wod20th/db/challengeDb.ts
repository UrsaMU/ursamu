// db/challengeDb.ts -- Typed DBO wrapper for wod20th.challenges.
//
// A challenge is a formal Garou contest between two characters: an
// initiator and a target. Each lives in its own record so it can be
// listed, audited, and resolved out-of-band (combat-typed challenges
// arm a flag and resolve on the next landed +attack).

import { DBO } from "@ursamu/ursamu";

export type ChallengeStatus =
  | "open"
  | "accepted"
  | "declined"
  | "withdrawn"
  | "resolved";

export interface IChallenge {
  id: string;
  initiatorCharId: string;
  targetCharId: string;
  /** Slug from CHALLENGE_TYPES. */
  typeSlug: string;
  /** Why the challenge was called. Free text, min 10 chars at issue time. */
  reason: string;
  status: ChallengeStatus;
  /** charId of the winner once resolved. */
  winnerCharId?: string;
  /** charId of a sept leader who consented (death-duel only). */
  septConsentBy?: string;
  createdAt: number;
  acceptedAt?: number;
  resolvedAt?: number;
}

const db = new DBO<IChallenge>("wod20th.challenges");

export async function createChallenge(
  initiatorCharId: string,
  targetCharId: string,
  typeSlug: string,
  reason: string,
): Promise<IChallenge> {
  const now = Date.now();
  const rec: IChallenge = {
    id: crypto.randomUUID(),
    initiatorCharId,
    targetCharId,
    typeSlug,
    reason,
    status: "open",
    createdAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findChallenge(id: string): Promise<IChallenge | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

/** Open OR accepted challenge for a given (initiator, target) ordered pair. */
export async function findOpenByPair(
  initiatorCharId: string,
  targetCharId: string,
): Promise<IChallenge[]> {
  const all = await db.find({});
  return all.filter((c) =>
    c.initiatorCharId === initiatorCharId &&
    c.targetCharId === targetCharId &&
    (c.status === "open" || c.status === "accepted")
  );
}

/** Open or accepted challenges either involving the given char. */
export async function findOpenByChar(charId: string): Promise<IChallenge[]> {
  const all = await db.find({});
  return all.filter((c) =>
    (c.initiatorCharId === charId || c.targetCharId === charId) &&
    (c.status === "open" || c.status === "accepted")
  );
}

export async function saveChallenge(ch: IChallenge): Promise<void> {
  await db.modify({ id: ch.id }, "$set", {
    initiatorCharId: ch.initiatorCharId,
    targetCharId: ch.targetCharId,
    typeSlug: ch.typeSlug,
    reason: ch.reason,
    status: ch.status,
    winnerCharId: ch.winnerCharId,
    septConsentBy: ch.septConsentBy,
    createdAt: ch.createdAt,
    acceptedAt: ch.acceptedAt,
    resolvedAt: ch.resolvedAt,
  } as Partial<IChallenge>);
}

export async function deleteChallenge(id: string): Promise<void> {
  await db.delete({ id });
}

export async function findAllChallenges(): Promise<IChallenge[]> {
  return await db.find({});
}
