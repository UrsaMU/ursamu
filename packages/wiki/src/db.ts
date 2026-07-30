import { DBO, getConfig, dbojs } from "@ursamu/mush";

// ─── subscriptions ────────────────────────────────────────────────────────────

/** A player's reply-watch subscription on a wiki page. */
export interface IWikiSubscription {
  id:        string;
  playerId:  string;
  path:      string;
  createdAt: number;
}

/** Per-player wiki page watch subscriptions. */
export const subscriptions = new DBO<IWikiSubscription>(() =>
  getConfig<string>("plugins.wiki.db", "wiki.subscriptions")
);

/** Maximum number of pages a single player may watch simultaneously. */
export const MAX_PLAYER_SUBS = 200;

// ─── auth helper ─────────────────────────────────────────────────────────────

/**
 * Returns true if userId belongs to a player with admin, wizard, or superuser flags.
 * Used by REST routes which only have a userId string (no full SDK context).
 */
const STAFF_FLAGS = new Set(["admin", "wizard", "superuser"]);

function flagSet(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map((f) => String(f).toLowerCase()));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((f) => String(f).toLowerCase()));
  }
  const str = String(raw ?? "");
  return new Set(
    str.split(/[\s,|]+/).map((f) => f.toLowerCase()).filter(Boolean),
  );
}

/** True if flags include admin, wizard, or superuser (admin+). */
export function flagsAreStaff(raw: unknown): boolean {
  const set = flagSet(raw);
  for (const f of STAFF_FLAGS) {
    if (set.has(f)) return true;
  }
  return false;
}

export async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  return flagsAreStaff(player.flags);
}
