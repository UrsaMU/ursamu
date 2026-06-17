// Persistent NPC directory. Each entry mirrors a real IDBObj NPC so the
// stat block can be looked up by name across rooms and reused. The DBO
// collection is "cofd.npcs".

import { DBO } from "@ursamu/ursamu";
import type { NpcTier } from "./archetypes.ts";

export interface NpcRecord {
  id: string;
  name: string;
  archetype: string;
  tier: NpcTier;
  dreadPowers: string[];
  objId: string;
  roomId: string | null;
  createdAt: number;
  createdBy: string;
  /** Pass 2: AI archetype key (see src/combat/ai). */
  aiArchetype?: string;
  /** Pass 2: optional loot table override key. */
  lootTable?: string;
}

/** Pass 2: write a fresh aiArchetype to an existing directory record. */
export async function updateNpcAiArchetype(
  id: string,
  aiArchetype: string,
): Promise<void> {
  const rec = (await npcDb.findOne({ id } as Q)) as NpcRecord | null;
  if (!rec) return;
  await npcDb.update({ id } as Q, { ...rec, aiArchetype });
}

// deno-lint-ignore no-explicit-any
type Q = any;

export const npcDb = new DBO<NpcRecord>("cofd.npcs");

/** Generate a stable directory id from a timestamp + random suffix. */
export function newNpcId(): string {
  return `npc-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

export async function saveNpcRecord(r: NpcRecord): Promise<void> {
  await npcDb.create(r);
}

export async function findNpcByName(name: string): Promise<NpcRecord | null> {
  const all = (await npcDb.find({} as Q)) as NpcRecord[];
  const lc = name.toLowerCase().trim();
  return all.find((r) => r.name.toLowerCase() === lc) ?? null;
}

export async function findNpcByObjId(objId: string): Promise<NpcRecord | null> {
  const all = (await npcDb.find({} as Q)) as NpcRecord[];
  return all.find((r) => r.objId === objId) ?? null;
}

export async function removeNpcRecord(id: string): Promise<void> {
  await npcDb.delete({ id } as Q);
}

export async function updateNpcPowers(id: string, powers: string[]): Promise<void> {
  const rec = (await npcDb.findOne({ id } as Q)) as NpcRecord | null;
  if (!rec) return;
  await npcDb.update({ id } as Q, { ...rec, dreadPowers: powers });
}
