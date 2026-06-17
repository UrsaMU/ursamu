import { DBO } from "@ursamu/mush";
import { dbojs } from "@ursamu/mush";

// ─── subscriptions ────────────────────────────────────────────────────────────

/** A player's reply-watch subscription on a wiki page. */
export interface IWikiSubscription {
  id:        string;
  playerId:  string;
  path:      string;
  createdAt: number;
}

/** Per-player wiki page watch subscriptions. */
export const subscriptions = new DBO<IWikiSubscription>("wiki.subscriptions");

/** Maximum number of pages a single player may watch simultaneously. */
export const MAX_PLAYER_SUBS = 200;

// ─── auth helper ─────────────────────────────────────────────────────────────

/**
 * Returns true if userId belongs to a player with admin, wizard, or superuser flags.
 * Used by REST routes which only have a userId string (no full SDK context).
 */
export async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = player.flags as unknown;
  // flags may be a Set<string> or a space-separated string depending on version
  if (flags instanceof Set) {
    return (flags as Set<string>).has("admin") || (flags as Set<string>).has("wizard") || (flags as Set<string>).has("superuser");
  }
  const str = (flags as string) || "";
  return str.includes("admin") || str.includes("wizard") || str.includes("superuser");
}
