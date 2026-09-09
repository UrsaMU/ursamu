// db/boonDb.ts -- Kindred boon economy (status favors).

import { DBO } from "@ursamu/mush";

/** trivial < minor < major < life */
export type BoonWeight = "trivial" | "minor" | "major" | "life";

export interface IBoon {
  id: string;
  /** charId who owes the boon. */
  debtorId: string;
  /** charId who is owed. */
  creditorId: string;
  weight: BoonWeight;
  reason: string;
  /** open | paid | void */
  status: "open" | "paid" | "void";
  createdAt: number;
  updatedAt: number;
  paidAt?: number;
}

const db = new DBO<IBoon>("wod20th.boons");

export async function createBoon(
  debtorId: string,
  creditorId: string,
  weight: BoonWeight,
  reason: string,
): Promise<IBoon> {
  const now = Date.now();
  const rec: IBoon = {
    id: crypto.randomUUID(),
    debtorId,
    creditorId,
    weight,
    reason: reason.slice(0, 200),
    status: "open",
    createdAt: now,
    updatedAt: now,
  };
  await db.create(rec);
  return rec;
}

export async function findBoonById(id: string): Promise<IBoon | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findBoonsFor(charId: string): Promise<IBoon[]> {
  const all = await db.find({});
  return all
    .filter((b) => b.debtorId === charId || b.creditorId === charId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function findOpenBoons(): Promise<IBoon[]> {
  const all = await db.find({});
  return all.filter((b) => b.status === "open");
}

export async function saveBoon(b: IBoon): Promise<void> {
  b.updatedAt = Date.now();
  await db.modify({ id: b.id }, "$set", {
    debtorId: b.debtorId,
    creditorId: b.creditorId,
    weight: b.weight,
    reason: b.reason,
    status: b.status,
    updatedAt: b.updatedAt,
    ...(b.paidAt !== undefined ? { paidAt: b.paidAt } : {}),
  } as Partial<IBoon>);
}

export function parseBoonWeight(raw: string): BoonWeight | null {
  const q = raw.toLowerCase().trim();
  if (q === "trivial" || q === "t") return "trivial";
  if (q === "minor" || q === "min") return "minor";
  if (q === "major" || q === "maj") return "major";
  if (q === "life" || q === "blood") return "life";
  return null;
}
