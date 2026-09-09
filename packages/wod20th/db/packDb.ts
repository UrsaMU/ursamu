// db/packDb.ts -- Typed DBO wrapper for wod20th.packs collection.
//
// A Pack is a Garou social unit (canon WtA mechanic). Membership is
// per-character (members[] holds IWoDChar.id values). Alpha is the
// pack leader and the only one who can invite/disband.

import { DBO } from "@ursamu/ursamu";

export interface IPack {
  id: string;
  /** Display name. Unique-ish (case-insensitive); enforced at creation time. */
  name: string;
  /** charId of the alpha. */
  alpha: string;
  /** charIds of all members (alpha is included). Order = join order. */
  members: string[];
  /** Spirit name; empty when no totem bound. */
  totem: string;
  /** Totem background rating; 0 when no totem. */
  totemRating: number;
  /** Free-form notes/boons (one per line) -- staff curates. */
  totemBoons: string[];
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<IPack>("wod20th.packs");

export async function createPack(name: string, alpha: string): Promise<IPack> {
  const now = Date.now();
  const rec: IPack = {
    id: crypto.randomUUID(),
    name,
    alpha,
    members: [alpha],
    totem: "",
    totemRating: 0,
    totemBoons: [],
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findPackById(id: string): Promise<IPack | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findPackByName(name: string): Promise<IPack | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((p) => p.name.toLowerCase() === lower) ?? null;
}

export async function findAllPacks(): Promise<IPack[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePack(pack: IPack): Promise<void> {
  pack.updatedAt = Date.now();
  await db.modify({ id: pack.id }, "$set", {
    name: pack.name,
    alpha: pack.alpha,
    members: pack.members,
    totem: pack.totem,
    totemRating: pack.totemRating,
    totemBoons: pack.totemBoons,
    updatedAt: pack.updatedAt,
  } as Partial<IPack>);
}

export async function deletePack(id: string): Promise<void> {
  await db.delete({ id });
}
