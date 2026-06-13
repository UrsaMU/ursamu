// ─── Round Manager ────────────────────────────────────────────────────────────
//
// Tracks which players need to pose before the GM adjudicates a round.
// Rounds are per-room: each watched room has at most one open round at a time.
//
// Lifecycle:
//   openRound(roomId, sessionId, players)
//     -> contributions accumulate via addPose()
//     -> when all ready OR timeout fires: triggerAdjudication()
//   triggerAdjudication() compresses multi-pose players and invokes poseGraph

import type { IGMContribution, IGMRound } from "./schema.ts";
import { gmRounds } from "./db.ts";

// ─── Open a new round ─────────────────────────────────────────────────────────

export async function openRound(
  roomId: string,
  sessionId: string,
  expectedPlayers: string[], // playerIds currently in room
  playerNames: Map<string, string>,
  timeoutSeconds: number,
): Promise<IGMRound> {
  // Close any existing open round for this room first
  const existing = await gmRounds.queryOne(
    {
      roomId,
      status: "open",
    } as Parameters<typeof gmRounds.queryOne>[0],
  );

  if (existing) {
    await gmRounds.modify(
      { id: existing.id } as Parameters<typeof gmRounds.modify>[0],
      "$set",
      { status: "closed", closedAt: Date.now() },
    );
  }

  const now = Date.now();
  const contributions: IGMContribution[] = expectedPlayers.map((pid) => ({
    playerId: pid,
    playerName: playerNames.get(pid) ?? pid,
    poses: [],
    ready: false,
  }));

  const round: Omit<IGMRound, "id"> = {
    sessionId,
    roomId,
    status: "open",
    expectedPlayers,
    contributions,
    openedAt: now,
    timeoutAt: now + timeoutSeconds * 1000,
  };

  return gmRounds.create(
    round as Parameters<typeof gmRounds.create>[0],
  ) as Promise<IGMRound>;
}

// ─── Add a player pose to an open round ──────────────────────────────────────

export async function addPose(
  roomId: string,
  playerId: string,
  poseText: string,
): Promise<{ round: IGMRound | null; allReady: boolean }> {
  const round = await gmRounds.queryOne(
    {
      roomId,
      status: "open",
    } as Parameters<typeof gmRounds.queryOne>[0],
  ) as IGMRound | null;

  if (!round) return { round: null, allReady: false };

  const contribs = round.contributions.map((c): IGMContribution => {
    if (c.playerId !== playerId) return c;
    return { ...c, poses: [...c.poses, poseText], ready: true };
  });

  await gmRounds.modify(
    { id: round.id } as Parameters<typeof gmRounds.modify>[0],
    "$set",
    { contributions: contribs },
  );

  const updated: IGMRound = { ...round, contributions: contribs };
  const allReady = contribs.every((c) => c.ready);
  return { round: updated, allReady };
}

// ─── Get the current open round for a room ───────────────────────────────────

export function getOpenRound(roomId: string): Promise<IGMRound | null> {
  return gmRounds.queryOne(
    {
      roomId,
      status: "open",
    } as Parameters<typeof gmRounds.queryOne>[0],
  ) as Promise<IGMRound | null>;
}

// ─── Check if a round has timed out ──────────────────────────────────────────

export function isTimedOut(round: IGMRound): boolean {
  return Date.now() >= round.timeoutAt;
}

// ─── Advance round to summarizing / adjudicating ──────────────────────────────

export async function markRoundSummarizing(roundId: string): Promise<void> {
  await gmRounds.modify(
    { id: roundId } as Parameters<typeof gmRounds.modify>[0],
    "$set",
    { status: "summarizing" },
  );
}

export async function markRoundAdjudicating(roundId: string): Promise<void> {
  await gmRounds.modify(
    { id: roundId } as Parameters<typeof gmRounds.modify>[0],
    "$set",
    { status: "adjudicating" },
  );
}

export async function closeRound(roundId: string): Promise<void> {
  await gmRounds.modify(
    { id: roundId } as Parameters<typeof gmRounds.modify>[0],
    "$set",
    { status: "closed", closedAt: Date.now() },
  );
}

// ─── Build round summary text for the pose graph ─────────────────────────────

export function buildRoundSummary(round: IGMRound): string {
  const lines: string[] = [`Room: ${round.roomId}`];

  for (const c of round.contributions) {
    if (!c.ready) {
      lines.push(`  ${c.playerName}: (did not pose this round)`);
      continue;
    }
    if (c.summary) {
      lines.push(`  ${c.playerName}: ${c.summary}`);
    } else if (c.poses.length === 1) {
      lines.push(`  ${c.playerName}: ${c.poses[0]}`);
    } else {
      // Multiple poses -- show all, GM agent will see them all in context
      lines.push(`  ${c.playerName} (${c.poses.length} poses):`);
      c.poses.forEach((p, i) => lines.push(`    [${i + 1}] ${p}`));
    }
  }

  return lines.join("\n");
}

// ─── Timeout sweep ────────────────────────────────────────────────────────────
//
// Called periodically (e.g. every 30s) to fire rounds that have timed out.
// Returns all timed-out open rounds so the caller can adjudicate them.

export async function collectTimedOutRounds(): Promise<IGMRound[]> {
  const allOpen = (await gmRounds.query(
    {
      status: "open",
    } as Parameters<typeof gmRounds.query>[0],
  )) as IGMRound[];

  return allOpen.filter(isTimedOut);
}
