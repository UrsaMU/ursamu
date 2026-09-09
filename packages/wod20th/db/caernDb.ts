// db/caernDb.ts -- Typed DBO wrapper for wod20th.caerns collection.
//
// A caern is a sacred site -- a node of spiritual power that anchors a
// sept (a community of packs). Packs claim caerns; the caern grants
// Gnosis regen and ritual bonuses while characters are in the bound
// room. Caerns have their own lifecycle (staff create / disband, alphas
// claim / release), so they live in their own collection rather than
// inline character state.

import { DBO } from "@ursamu/ursamu";

export type CaernLevel = 1 | 2 | 3 | 4 | 5;

export interface ICaern {
  id: string;
  /** Display name. Unique (case-insensitive); enforced at creation time. */
  name: string;
  /** Caern rating 1-5 (like a Background dot count). */
  level: CaernLevel;
  /** Caern type, e.g. "Wisdom", "Honor", "Glory", "Rage", "Healing". */
  type: string;
  /** The room id this caern is bound to. Empty until staff binds it. */
  locationRoomId?: string;
  /** Human-readable sept name; empty until set. */
  septName?: string;
  /** Pack ids sharing this caern (alphas claim / release). */
  packIds: string[];
  /** Char ids of named guardians / warders. */
  guardians: string[];
  /** Ritual / warding difficulty (Gauntlet override or ritual baseline). */
  wardingDifficulty: number;
  /** Free-form notes (one per line); staff curates. */
  notes: string[];
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<ICaern>("wod20th.caerns");

export async function createCaern(
  name: string,
  level: CaernLevel,
  type: string,
): Promise<ICaern> {
  const now = Date.now();
  const rec: ICaern = {
    id: crypto.randomUUID(),
    name,
    level,
    type,
    packIds: [],
    guardians: [],
    wardingDifficulty: 6,
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findCaernById(id: string): Promise<ICaern | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findCaernByName(name: string): Promise<ICaern | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((c) => c.name.toLowerCase() === lower) ?? null;
}

export async function findCaernByRoom(roomId: string): Promise<ICaern | null> {
  const all = await db.find({});
  return all.find((c) => c.locationRoomId === roomId) ?? null;
}

export async function findAllCaerns(): Promise<ICaern[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCaern(caern: ICaern): Promise<void> {
  caern.updatedAt = Date.now();
  await db.modify({ id: caern.id }, "$set", {
    name: caern.name,
    level: caern.level,
    type: caern.type,
    locationRoomId: caern.locationRoomId,
    septName: caern.septName,
    packIds: caern.packIds,
    guardians: caern.guardians,
    wardingDifficulty: caern.wardingDifficulty,
    notes: caern.notes,
    updatedAt: caern.updatedAt,
  } as Partial<ICaern>);
}

export async function deleteCaern(id: string): Promise<void> {
  await db.delete({ id });
}
