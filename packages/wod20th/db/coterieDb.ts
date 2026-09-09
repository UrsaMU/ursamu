// db/coterieDb.ts -- VtM coterie (Kindred social unit).

import { DBO } from "@ursamu/mush";

export interface ICoterie {
  id: string;
  name: string;
  /** charId of the leader. */
  leader: string;
  /** charIds including leader. */
  members: string[];
  /** Free-form purpose / notes. */
  purpose: string;
  /** Optional domain id claim. */
  domainId: string;
  createdAt: number;
  updatedAt: number;
}

const db = new DBO<ICoterie>("wod20th.coteries");

export async function createCoterie(
  name: string,
  leader: string,
): Promise<ICoterie> {
  const now = Date.now();
  const rec: ICoterie = {
    id: crypto.randomUUID(),
    name,
    leader,
    members: [leader],
    purpose: "",
    domainId: "",
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findCoterieById(id: string): Promise<ICoterie | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findCoterieByName(name: string): Promise<ICoterie | null> {
  const all = await db.find({});
  const lower = name.toLowerCase().trim();
  return all.find((p) => p.name.toLowerCase() === lower) ?? null;
}

export async function findAllCoteries(): Promise<ICoterie[]> {
  const all = await db.find({});
  return all.sort((a, b) => a.createdAt - b.createdAt);
}

export async function saveCoterie(c: ICoterie): Promise<void> {
  c.updatedAt = Date.now();
  await db.modify({ id: c.id }, "$set", {
    name: c.name,
    leader: c.leader,
    members: c.members,
    purpose: c.purpose,
    domainId: c.domainId,
    updatedAt: c.updatedAt,
  } as Partial<ICoterie>);
}

export async function deleteCoterie(id: string): Promise<void> {
  await db.delete({ id });
}
