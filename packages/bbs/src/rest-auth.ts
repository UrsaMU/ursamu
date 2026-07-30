/**
 * Pure REST auth helpers for /api/v1/boards — no DB.
 * Tested without KV (same bar as @ursamu/jobs rest-auth).
 */
import type { IBoard, IPost } from "./db.ts";
import { evalBoardLock } from "./lock-eval.ts";

const STAFF = new Set(["admin", "wizard", "superuser"]);

/** Strip leading # from player/object ids. */
export function bareId(raw: unknown): string {
  return String(raw ?? "").replace(/^#/, "").trim();
}

/** Normalize stored flags to a lowercase Set (no substring matches). */
export function flagSetFromRaw(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map((f) => String(f).toLowerCase()));
  }
  if (Array.isArray(raw)) {
    return new Set(raw.map((f) => String(f).toLowerCase()));
  }
  return new Set(
    String(raw || "")
      .split(/[\s,|]+/)
      .map((f) => f.toLowerCase())
      .filter(Boolean),
  );
}

/** True when flag set includes a staff privilege. */
export function isStaffFlagSet(flags: Set<string>): boolean {
  for (const f of STAFF) {
    if (flags.has(f)) return true;
  }
  return false;
}

/** Board moderator list match (bare ids). */
export function isBoardModId(
  userId: string,
  board: Pick<IBoard, "moderators">,
): boolean {
  const me = bareId(userId);
  if (!me) return false;
  return (board.moderators ?? []).some(
    (m) => bareId(m) === me,
  );
}

/** Staff or listed board moderator. */
export function canModerateBoard(
  userId: string,
  board: Pick<IBoard, "moderators">,
  staff: boolean,
): boolean {
  return staff || isBoardModId(userId, board);
}

export type LockOpts = {
  staff: boolean;
  /** Faction membership when lock is "faction". */
  inFaction?: boolean;
  /**
   * Caller flags for flag()/perm()/legacy ladder locks.
   * Required for non-open locks when not staff.
   */
  flags?: Set<string>;
  /** Enactor id for is(#id) locks. */
  userId?: string;
};

/**
 * Read access for REST.
 * Open: missing / "" / "all()".
 * Faction: inFaction when ownerId set.
 * Else: evaluate flag()/perm()/&&/||/! against flags.
 */
export function canReadBoard(
  board: Pick<IBoard, "readLock" | "ownerId">,
  opts: LockOpts,
): boolean {
  if (opts.staff) return true;
  const lock = String(board.readLock ?? "").trim();
  if (!lock || lock === "all()") return true;
  if (lock === "faction" && board.ownerId) {
    return opts.inFaction === true;
  }
  const flags = opts.flags ?? new Set<string>();
  return evalBoardLock(lock, flags, opts.userId ?? "");
}

/**
 * Write access for REST. Archive always denied.
 * Same lock language as read.
 */
export function canWriteBoard(
  board: Pick<IBoard, "writeLock" | "ownerId" | "type">,
  opts: LockOpts,
): boolean {
  if (board.type === "archive") return false;
  if (opts.staff) return true;
  const lock = String(board.writeLock ?? "").trim();
  if (!lock || lock === "all()") return true;
  if (lock === "faction" && board.ownerId) {
    return opts.inFaction === true;
  }
  const flags = opts.flags ?? new Set<string>();
  return evalBoardLock(lock, flags, opts.userId ?? "");
}

/** Edit subject/body: author, board mod, or staff. */
export function canEditPost(
  post: Pick<IPost, "authorId">,
  board: Pick<IBoard, "moderators">,
  userId: string,
  staff: boolean,
): boolean {
  if (staff) return true;
  if (isBoardModId(userId, board)) return true;
  return bareId(post.authorId) === bareId(userId);
}

/** Sticky / timeout / clear flags: board mod or staff. */
export function canModeratePost(
  board: Pick<IBoard, "moderators">,
  userId: string,
  staff: boolean,
): boolean {
  return canModerateBoard(userId, board, staff);
}

/** Delete post: author, board mod, or staff. */
export function canDeletePost(
  post: Pick<IPost, "authorId">,
  board: Pick<IBoard, "moderators">,
  userId: string,
  staff: boolean,
): boolean {
  return canEditPost(post, board, userId, staff);
}

/**
 * Read-tracking from state.bb_read, with legacy data.bb_read.
 */
export function getReadSet(
  player: Record<string, unknown>,
  boardNum: number,
): Set<string> {
  const state =
    (player.state as Record<string, unknown> | undefined) ??
    {};
  const data =
    (player.data as Record<string, unknown> | undefined) ??
    {};
  const bbRead =
    (state.bb_read as Record<string, string[]> | undefined) ??
    (data.bb_read as Record<string, string[]> | undefined) ??
    {};
  return new Set(bbRead[String(boardNum)] ?? []);
}

/** Parse moderators field from PATCH body (array or string). */
export function parseModeratorsField(
  raw: unknown,
): string[] | undefined {
  if (raw === undefined) return undefined;
  if (Array.isArray(raw)) {
    return raw.map(bareId).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw
      .split(/[\s,]+/)
      .map(bareId)
      .filter(Boolean);
  }
  return [];
}
