// core/vote.ts -- player-vote XP reward system with circle-jerk caps.
//
// Each vote awards a small XP amount to the target. Caps:
//   - 1 XP per vote
//   - DAILY_VOTE_CAP votes per voter per 24h window
//   - PAIR_COOLDOWN_MS between any two voter-votee pairs (anti circle-jerk)
//   - MIN_REASON_LEN chars on the reason (forces actual thought)
//   - No self-vote
//   - Both characters must be approved
//
// Storage: an IVoteEntry[] on the VOTER's char (`voteHistory`). Querying the
// voter's own history is enough to enforce both the daily cap and pair
// cooldown -- no separate DBO needed.

import type { IVoteEntry, IWoDChar } from "./types.ts";

// Fractional XP -- a small trickle. 5 votes = 1 XP.
// Tuned so a "popular" character (~25 votes/week) earns ~5 XP/week.
export const VOTE_XP_AMOUNT      = 0.20;
/** Generous safety ceiling on total votes per voter per day. */
export const DAILY_VOTE_CAP      = 10;
/** Hard anti-circle-jerk cap: max votes for the SAME target in a rolling week. */
export const PER_PAIR_WEEKLY_LIMIT = 3;
export const DAILY_WINDOW_MS     = 24 * 60 * 60 * 1000;
export const WEEKLY_WINDOW_MS    = 7 * 24 * 60 * 60 * 1000;
export const MIN_REASON_LEN      = 10;
export const MAX_REASON_LEN      = 500;
/** Minimum poses the votee must have contributed in the current room before
 *  they're eligible to receive a vote. Stops vote-and-run drive-bys. */
export const MIN_POSES_FOR_VOTE  = 3;

export interface IVoteCheck {
  ok: boolean;
  message: string;
}

/**
 * Validate a prospective vote. Returns ok=true when the vote may proceed.
 * Pure: no mutation, no DB.
 */
export function canVote(
  voter: IWoDChar,
  voteeCharId: string,
  reason: string,
  now: number = Date.now(),
): IVoteCheck {
  if (voter.id === voteeCharId) {
    return { ok: false, message: "You can't vote for yourself." };
  }
  if (voter.status !== "approved") {
    return { ok: false, message: "Your character must be approved to vote." };
  }
  const trimmed = (reason ?? "").trim();
  if (trimmed.length < MIN_REASON_LEN) {
    return {
      ok: false,
      message: `Reason must be at least ${MIN_REASON_LEN} characters. Say what they did.`,
    };
  }
  if (trimmed.length > MAX_REASON_LEN) {
    return {
      ok: false,
      message: `Reason is too long (max ${MAX_REASON_LEN} characters).`,
    };
  }

  const history = voter.voteHistory ?? [];

  // Daily cap: count votes in the last 24h.
  const dailyCutoff = now - DAILY_WINDOW_MS;
  const recent = history.filter((v) => v.ts >= dailyCutoff);
  if (recent.length >= DAILY_VOTE_CAP) {
    const oldest = recent.sort((a, b) => a.ts - b.ts)[0];
    const nextSlot = oldest.ts + DAILY_WINDOW_MS;
    const hoursLeft = Math.ceil((nextSlot - now) / (60 * 60 * 1000));
    return {
      ok: false,
      message: `Daily vote cap reached (${DAILY_VOTE_CAP}/day). Next slot in ~${hoursLeft}h.`,
    };
  }

  // Per-pair weekly count: max 3 votes for the same person in 7 days.
  const weekCutoff = now - WEEKLY_WINDOW_MS;
  const pairThisWeek = history.filter(
    (v) => v.targetCharId === voteeCharId && v.ts >= weekCutoff,
  );
  if (pairThisWeek.length >= PER_PAIR_WEEKLY_LIMIT) {
    const oldest = [...pairThisWeek].sort((a, b) => a.ts - b.ts)[0];
    const nextSlot = oldest.ts + WEEKLY_WINDOW_MS;
    const daysLeft = Math.max(0, Math.ceil((nextSlot - now) / (24 * 60 * 60 * 1000)));
    return {
      ok: false,
      message:
        `You've already voted for them ${PER_PAIR_WEEKLY_LIMIT}x this week. ` +
        `Slot opens in ~${daysLeft}d.`,
    };
  }

  return { ok: true, message: "" };
}

/** Count votes the voter has cast for a specific target in the last 7 days. */
export function votesForTargetThisWeek(
  voter: IWoDChar,
  voteeCharId: string,
  now: number = Date.now(),
): number {
  const cutoff = now - WEEKLY_WINDOW_MS;
  return (voter.voteHistory ?? []).filter(
    (v) => v.targetCharId === voteeCharId && v.ts >= cutoff,
  ).length;
}

/**
 * Append a vote entry to the voter's history. Returns a new char object;
 * does not mutate. Trims the reason. Truncates history at 100 entries
 * (rolling window) to keep records bounded.
 */
export function recordVote(
  voter: IWoDChar,
  voteeCharId: string,
  reason: string,
  ts: number = Date.now(),
): IWoDChar {
  const entry: IVoteEntry = {
    targetCharId: voteeCharId,
    reason: reason.trim(),
    ts,
  };
  const history = [...(voter.voteHistory ?? []), entry].slice(-100);
  return { ...voter, voteHistory: history };
}

/** Returns the voter's votes in the last 24h. */
export function votesToday(voter: IWoDChar, now: number = Date.now()): IVoteEntry[] {
  const cutoff = now - DAILY_WINDOW_MS;
  return (voter.voteHistory ?? []).filter((v) => v.ts >= cutoff);
}

/** Returns the timestamp of the voter's most recent vote for the target, or 0. */
export function lastVoteFor(voter: IWoDChar, voteeCharId: string): number {
  const hits = (voter.voteHistory ?? []).filter((v) => v.targetCharId === voteeCharId);
  return hits.length === 0 ? 0 : Math.max(...hits.map((v) => v.ts));
}
