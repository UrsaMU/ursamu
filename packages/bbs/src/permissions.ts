import { dbojs, evaluateLock, hydrate } from "@ursamu/mush";
import type { IUrsamuSDK, IDBObj } from "@ursamu/mush";
import type { IBoard } from "./db.ts";
import { evalBoardLock } from "./lock-eval.ts";
import { flagSetFromRaw } from "./rest-auth.ts";

/** Returns true if the caller has staff-level privilege. */
export function isStaff(u: IUrsamuSDK): boolean {
  return (
    u.me.flags.has("superuser") ||
    u.me.flags.has("admin") ||
    u.me.flags.has("wizard")
  );
}

/** Returns true if the caller can moderate a specific board. */
export function isBoardMod(u: IUrsamuSDK, board: IBoard): boolean {
  if (isStaff(u)) return true;
  return (board.moderators ?? []).includes(u.me.id);
}

async function isFactionMember(
  playerId: string,
  factionId: string,
): Promise<boolean> {
  try {
    const faction = await dbojs.queryOne({ id: factionId });
    if (!faction) return false;
    const contents =
      (faction?.contents as string[] | undefined) ?? [];
    return contents.includes(playerId) ||
      contents.includes(`#${playerId}`);
  } catch (_e: unknown) {
    return false;
  }
}

/**
 * Evaluate a board lock string for an enactor.
 * Open / faction special-cases, else engine evaluateLock with
 * pure lock-eval fallback.
 */
export async function passesBoardLock(
  lockRaw: string,
  enactor: IDBObj,
  opts: { ownerId?: string } = {},
): Promise<boolean> {
  const lock = String(lockRaw ?? "").trim();
  if (!lock || lock === "all()") return true;
  if (lock === "faction" && opts.ownerId) {
    return await isFactionMember(enactor.id, opts.ownerId);
  }
  try {
    return await evaluateLock(lock, enactor, enactor);
  } catch (_e: unknown) {
    return evalBoardLock(
      lock,
      enactor.flags instanceof Set
        ? enactor.flags
        : flagSetFromRaw(enactor.flags),
      enactor.id,
    );
  }
}

/**
 * Returns true if the caller can read the board.
 * Supports all(), faction, and engine lockfuncs (flag/perm/…).
 * Staff always bypass.
 */
export async function canRead(
  u: IUrsamuSDK,
  board: IBoard,
): Promise<boolean> {
  if (isStaff(u)) return true;
  return await passesBoardLock(board.readLock ?? "", u.me, {
    ownerId: board.ownerId,
  });
}

/**
 * Returns true if the caller can post to the board.
 * Archive boards are always read-only. Staff bypass locks
 * (but not archive).
 */
export async function canWrite(
  u: IUrsamuSDK,
  board: IBoard,
): Promise<boolean> {
  if (board.type === "archive") return false;
  if (isStaff(u)) return true;
  return await passesBoardLock(board.writeLock ?? "", u.me, {
    ownerId: board.ownerId,
  });
}

/** Hydrate a DBO row into IDBObj for lock checks (REST). */
export function enactorFromPlayerRow(
  row: Record<string, unknown>,
): IDBObj {
  try {
    // deno-lint-ignore no-explicit-any
    return hydrate(row as any);
  } catch (_e: unknown) {
    const flags = flagSetFromRaw(row.flags);
    return {
      id: String(row.id ?? "").replace(/^#/, ""),
      name: String(
        (row.data as { name?: string } | undefined)?.name ??
          "Unknown",
      ),
      flags,
      state: (row.data as Record<string, unknown>) ?? {},
      location: String(row.location ?? ""),
      contents: [],
    };
  }
}
