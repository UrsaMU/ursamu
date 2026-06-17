import { dbojs } from "@ursamu/mush";
import type { IUrsamuSDK } from "@ursamu/mush";
import type { IBoard } from "./db.ts";

/** Returns true if the caller has staff-level privilege. */
export function isStaff(u: IUrsamuSDK): boolean {
  return (
    u.me.flags.has("superuser") ||
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard")
  );
}

/** Returns true if the caller can moderate a specific board (staff or listed mod). */
export function isBoardMod(u: IUrsamuSDK, board: IBoard): boolean {
  if (isStaff(u)) return true;
  return (board.moderators ?? []).includes(u.me.id);
}

/**
 * Returns true if the caller can read the board.
 * Supports: "all()" (open), "" (open), "faction" (ownerId-based), staff bypass.
 */
export async function canRead(u: IUrsamuSDK, board: IBoard): Promise<boolean> {
  if (isStaff(u)) return true;
  if (!board.readLock || board.readLock === "all()") return true;
  if (board.readLock === "faction" && board.ownerId) {
    return await isFactionMember(u.me.id, board.ownerId);
  }
  return false;
}

/**
 * Returns true if the caller can post to the board.
 * Archive boards are always read-only.
 */
export async function canWrite(u: IUrsamuSDK, board: IBoard): Promise<boolean> {
  if (board.type === "archive") return false;
  if (isStaff(u)) return true;
  if (!board.writeLock || board.writeLock === "all()") return true;
  if (board.writeLock === "faction" && board.ownerId) {
    return await isFactionMember(u.me.id, board.ownerId);
  }
  return false;
}

async function isFactionMember(
  playerId: string,
  factionId: string,
): Promise<boolean> {
  try {
    const faction = await dbojs.queryOne({ id: factionId });
    if (!faction) return false;
    const contents = (faction?.contents as string[] | undefined) ?? [];
    return contents.includes(playerId);
  } catch {
    return false;
  }
}
