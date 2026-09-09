// db/xpDb.ts -- Typed DBO wrapper for wod20th.xp collection.
import { DBO } from "@ursamu/ursamu";
import type { IXpEntry } from "../core/types.ts";

const db = new DBO<IXpEntry>("wod20th.xp");

/** Record an XP award or spend. */
export async function createXpEntry(entry: IXpEntry): Promise<void> {
  await db.create(entry);
}

/** All XP entries for a character, sorted oldest-first. */
export async function findXpByChar(charId: string): Promise<IXpEntry[]> {
  const results = await db.find({ charId });
  return results.sort((a, b) => a.ts - b.ts);
}

/** Most recent N entries for a character. */
export async function findRecentXp(charId: string, limit = 10): Promise<IXpEntry[]> {
  const all = await findXpByChar(charId);
  return all.slice(-limit);
}

/** XP summary: total awarded, total spent, remaining. */
export async function xpSummary(charId: string): Promise<{ total: number; spent: number; remaining: number }> {
  const entries = await findXpByChar(charId);
  const total  = entries.filter((e) => e.type === "award").reduce((s, e) => s + e.amount, 0);
  const spent  = entries.filter((e) => e.type === "spend").reduce((s, e) => s + Math.abs(e.amount), 0);
  return { total, spent, remaining: total - spent };
}
