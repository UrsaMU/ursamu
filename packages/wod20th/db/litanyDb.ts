// db/litanyDb.ts -- Typed DBO wrapper for wod20th.litanyCharges collection.
//
// A Litany charge is an accusation filed by one Garou against another for
// breaching one of the thirteen laws. Charges have a status lifecycle:
//   pending   -- filed, awaiting staff resolution
//   upheld    -- staff agreed; penalty applied
//   dismissed -- staff rejected; small Honor cost to the accuser
//   withdrawn -- accuser pulled the charge before resolution
//
// Status is the source of truth -- charges are NEVER hard-deleted, so the
// record persists for audit and chronicle reference.

import { DBO } from "@ursamu/ursamu";

export type LitanyChargeStatus = "pending" | "upheld" | "dismissed" | "withdrawn";

export interface ILitanyCharge {
  id: string;
  accuserCharId: string;
  targetCharId: string;
  lawSlug: string;
  reason: string;
  status: LitanyChargeStatus;
  createdAt: number;
  resolvedAt?: number;
  /** charId of the staff member (or accuser, on withdraw) who resolved. */
  resolverCharId?: string;
}

const db = new DBO<ILitanyCharge>("wod20th.litanyCharges");

export async function createCharge(
  accuserCharId: string,
  targetCharId: string,
  lawSlug: string,
  reason: string,
): Promise<ILitanyCharge> {
  const rec: ILitanyCharge = {
    id: crypto.randomUUID(),
    accuserCharId,
    targetCharId,
    lawSlug,
    reason,
    status: "pending",
    createdAt: Date.now(),
  };
  await db.create(rec);
  return rec;
}

export async function findCharge(id: string): Promise<ILitanyCharge | null> {
  const r = await db.find({ id });
  return r[0] ?? null;
}

export async function findChargesByTarget(charId: string): Promise<ILitanyCharge[]> {
  const all = await db.find({});
  return all
    .filter((c) => c.targetCharId === charId)
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function findOpenChargesByAccuser(charId: string): Promise<ILitanyCharge[]> {
  const all = await db.find({});
  return all
    .filter((c) => c.accuserCharId === charId && c.status === "pending")
    .sort((a, b) => b.createdAt - a.createdAt);
}

export async function findAllCharges(): Promise<ILitanyCharge[]> {
  const all = await db.find({});
  return all.sort((a, b) => b.createdAt - a.createdAt);
}

export async function saveCharge(c: ILitanyCharge): Promise<void> {
  await db.modify({ id: c.id }, "$set", {
    accuserCharId: c.accuserCharId,
    targetCharId: c.targetCharId,
    lawSlug: c.lawSlug,
    reason: c.reason,
    status: c.status,
    resolvedAt: c.resolvedAt,
    resolverCharId: c.resolverCharId,
  } as Partial<ILitanyCharge>);
}

/** Convenience: set status=withdrawn with timestamp + resolver. */
export async function withdrawCharge(id: string, resolverCharId: string): Promise<ILitanyCharge | null> {
  const c = await findCharge(id);
  if (!c) return null;
  c.status = "withdrawn";
  c.resolvedAt = Date.now();
  c.resolverCharId = resolverCharId;
  await saveCharge(c);
  return c;
}

/** Test-only -- remove a charge entirely (NOT used in command code). */
export async function _deleteChargeForTest(id: string): Promise<void> {
  await db.delete({ id });
}
