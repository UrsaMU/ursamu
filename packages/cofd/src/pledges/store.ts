// Store management for Pledges using DBO.

import { DBO } from "@ursamu/ursamu";
import type { PledgeRecord } from "./types.ts";

// deno-lint-ignore no-explicit-any
type Q = any;

export const pledgeDb = new DBO<PledgeRecord>("cofd.pledges");

export async function createPledge(
  partial: Omit<PledgeRecord, "id" | "createdAt" | "status">,
): Promise<PledgeRecord> {
  const now = Date.now();
  const pledge: PledgeRecord = {
    ...partial,
    id: `plg-${now}-${Math.floor(Math.random() * 1e6)}`,
    status: "pending",
    createdAt: now,
  };
  await pledgeDb.create(pledge);
  return pledge;
}

export async function getPledge(id: string): Promise<PledgeRecord | null> {
  return (await pledgeDb.findOne({ id } as Q)) ?? null;
}

export async function listPledges(playerId?: string): Promise<PledgeRecord[]> {
  const all = await pledgeDb.find({} as Q);
  if (!playerId) return all;
  return all.filter((p) => p.parties.includes(playerId));
}

export async function updatePledge(
  id: string,
  updateFn: (p: PledgeRecord) => PledgeRecord,
): Promise<PledgeRecord | null> {
  const updated = await pledgeDb.atomicModify(id, (current) => {
    if (!current) return current;
    return updateFn(current);
  });
  return updated ?? null;
}

export async function deletePledge(id: string): Promise<void> {
  await pledgeDb.delete({ id } as Q);
}
