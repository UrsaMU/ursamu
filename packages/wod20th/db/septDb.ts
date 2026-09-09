// db/septDb.ts -- Typed DBO wrapper for wod20th.septs collection.
//
// Per W20 (p. 55): a sept is the SOCIETY that forms around a caern. The
// caern is the spiritual node; the sept is its leadership, packs, and
// named positions. A sept HAS a caern (link via septId.caernId) and HAS
// packs (one or more); members are reached via pack.members.
//
// Mechanical link: the caern bound to the sept provides Gnosis regen and
// ritual die bonuses in the bound room (see core/caern.ts caernBonus).
// The sept layer is purely social/political: leader, positions, roster.

import { DBO } from "@ursamu/ursamu";

export interface ISept {
  id: string;
  /** Display name. Unique (case-insensitive); enforced at creation. */
  name: string;
  /** Primary caern this sept is built around. Null until staff binds. */
  caernId?: string;
  /** Packs that belong to this sept. */
  packIds: string[];
  /** charId of the sept leader (overall alpha / sept master). */
  leader?: string;
  /**
   * Sept positions: charId -> position name (free text). Canon examples:
   * "Master of the Rite", "Talesinger", "Caller of the Wyld", "Truthcatcher",
   * "Warder", "Den Mother", "Wyrm Foe", "Gatekeeper", "Master of the Howl".
   */
  positions: Record<string, string>;
  /** Free-form sept notes (one per line); staff curates. */
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<ISept>("wod20th.septs");

export async function createSept(name: string): Promise<ISept> {
  const now = Date.now();
  const rec: ISept = {
    id: crypto.randomUUID(),
    name,
    packIds: [],
    positions: {},
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findSeptById(id: string): Promise<ISept | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findSeptByName(name: string): Promise<ISept | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((s) => s.name.toLowerCase() === lower) ?? null;
}

/** Find the sept (if any) that contains the given pack. */
export async function findSeptByPack(packId: string): Promise<ISept | null> {
  const all = await db.find({});
  return all.find((s) => s.packIds.includes(packId)) ?? null;
}

/** Find the sept (if any) bound to the given caern. */
export async function findSeptByCaern(caernId: string): Promise<ISept | null> {
  const all = await db.find({});
  return all.find((s) => s.caernId === caernId) ?? null;
}

export async function findAllSepts(): Promise<ISept[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveSept(sept: ISept): Promise<void> {
  sept.updatedAt = Date.now();
  await db.modify({ id: sept.id }, "$set", {
    name: sept.name,
    caernId: sept.caernId,
    packIds: sept.packIds,
    leader: sept.leader,
    positions: sept.positions,
    notes: sept.notes,
    updatedAt: sept.updatedAt,
  } as Partial<ISept>);
}

export async function deleteSept(id: string): Promise<void> {
  await db.delete({ id });
}
