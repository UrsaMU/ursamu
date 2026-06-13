// ─── Spotlight Tracker ────────────────────────────────────────────────────────
//
// Records memorable player moments so the GM can reference and reward them.
// Staff can mark a spotlight; the GM auto-marks on exceptional move outcomes.

import { DBO } from "ursamu";
import { nanoid } from "../ingestion/util.ts";

// ─── Schema ───────────────────────────────────────────────────────────────────

export type SpotlightTier = "moment" | "highlight" | "legendary";

export interface ISpotlightEntry {
  id: string;
  sessionId?: string;
  playerId: string;
  playerName: string;
  description: string; // "Called the bluff and walked away clean."
  tier: SpotlightTier;
  move?: string; // associated move name if triggered by a roll
  total?: number; // roll total that triggered this
  createdBy: "gm" | "staff";
  createdAt: number;
}

export const gmSpotlights = new DBO<ISpotlightEntry>("server.gm.spotlights");

// ─── Record a spotlight moment ────────────────────────────────────────────────

export async function recordSpotlight(
  playerId: string,
  playerName: string,
  description: string,
  tier: SpotlightTier,
  options?: {
    sessionId?: string;
    move?: string;
    total?: number;
    createdBy?: "gm" | "staff";
  },
): Promise<ISpotlightEntry> {
  const entry: ISpotlightEntry = {
    id: nanoid(),
    sessionId: options?.sessionId,
    playerId,
    playerName,
    description,
    tier,
    move: options?.move,
    total: options?.total,
    createdBy: options?.createdBy ?? "gm",
    createdAt: Date.now(),
  };
  await gmSpotlights.create(entry as Parameters<typeof gmSpotlights.create>[0]);
  return entry;
}

// ─── Auto-spotlight on exceptional rolls ──────────────────────────────────────
// Called by move graph after adjudication when total is high enough.

export async function checkAutoSpotlight(
  playerId: string,
  playerName: string,
  moveName: string,
  total: number,
  sessionId?: string,
): Promise<ISpotlightEntry | null> {
  // Legendary: natural 12+; Highlight: 10-11 on a hard move
  let tier: SpotlightTier | null = null;
  if (total >= 12) tier = "legendary";
  else if (total >= 10) tier = "highlight";
  if (!tier) return null;

  const description = tier === "legendary"
    ? `Legendary ${moveName} roll (${total}) — the city remembers.`
    : `Highlight: ${moveName} (${total}).`;

  return await recordSpotlight(playerId, playerName, description, tier, {
    sessionId,
    move: moveName,
    total,
    createdBy: "gm",
  });
}

// ─── Retrieval ────────────────────────────────────────────────────────────────

export async function getSpotlights(
  options: { playerId?: string; sessionId?: string; limit?: number } = {},
): Promise<ISpotlightEntry[]> {
  const all = await gmSpotlights.all() as ISpotlightEntry[];
  let filtered = all;
  if (options.playerId) {
    filtered = filtered.filter((s) => s.playerId === options.playerId);
  }
  if (options.sessionId) {
    filtered = filtered.filter((s) => s.sessionId === options.sessionId);
  }
  return filtered
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, options.limit ?? 20);
}

/** Format spotlights for in-game ASCII display. */
export function formatSpotlights(entries: ISpotlightEntry[]): string {
  if (!entries.length) return "No spotlights recorded.";
  return entries.map((e) => {
    const tier = e.tier === "legendary"
      ? "***"
      : e.tier === "highlight"
      ? "**"
      : "*";
    const date = new Date(e.createdAt).toISOString().slice(0, 10);
    return `${tier} [${date}] ${e.playerName}: ${e.description}`;
  }).join("\n");
}
