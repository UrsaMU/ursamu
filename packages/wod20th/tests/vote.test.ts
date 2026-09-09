import { assert, assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  DAILY_VOTE_CAP,
  DAILY_WINDOW_MS,
  MIN_REASON_LEN,
  PER_PAIR_WEEKLY_LIMIT,
  VOTE_XP_AMOUNT,
  WEEKLY_WINDOW_MS,
  canVote,
  lastVoteFor,
  recordVote,
  votesForTargetThisWeek,
  votesToday,
} from "../core/vote.ts";
import type { IWoDChar } from "../core/types.ts";

const base: IWoDChar = {
  id: "voter", playerId: "p-voter", splat: "wta", status: "approved", chargenStep: 6,
  concept: "", attributePriority: ["", "", ""], attributes: {},
  attributeSpecialties: {}, abilityPriority: ["", "", ""], abilities: {},
  abilitySpecialties: {}, backgrounds: {}, willpower: 5,
  freebiesRemaining: 0, freebiesLog: [], xpTotal: 0, xpSpent: 0,
  notes: [], staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
};

const GOOD_REASON = "Phenomenal RP at the caern with the spirits all evening.";

describe("canVote", () => {
  it("rejects self-vote", () => {
    const r = canVote(base, base.id, GOOD_REASON);
    assertEquals(r.ok, false);
    assert(r.message.includes("yourself"));
  });

  it("rejects unapproved voter", () => {
    const draft = { ...base, status: "draft" as const };
    const r = canVote(draft, "other", GOOD_REASON);
    assertEquals(r.ok, false);
    assert(r.message.toLowerCase().includes("approved"));
  });

  it("rejects empty reason", () => {
    const r = canVote(base, "other", "");
    assertEquals(r.ok, false);
    assert(r.message.includes(String(MIN_REASON_LEN)));
  });

  it("rejects short reason", () => {
    const r = canVote(base, "other", "good rp");
    assertEquals(r.ok, false);
  });

  it("accepts a fresh voter with good reason", () => {
    const r = canVote(base, "other", GOOD_REASON);
    assertEquals(r.ok, true);
  });

  it("rejects when daily cap is reached", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: Array.from({ length: DAILY_VOTE_CAP }, (_, i) => ({
        targetCharId: `t${i}`,
        reason: GOOD_REASON,
        ts: now - i * 60_000, // all within last 24h
      })),
    };
    const r = canVote(voter, "fresh-target", GOOD_REASON, now);
    assertEquals(r.ok, false);
    assert(r.message.toLowerCase().includes("daily"));
  });

  it("allows vote once an old daily-window entry has expired", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        { targetCharId: "old-target", reason: GOOD_REASON, ts: now - DAILY_WINDOW_MS - 1 },
      ],
    };
    const r = canVote(voter, "fresh-target", GOOD_REASON, now);
    assertEquals(r.ok, true);
  });

  it("allows up to PER_PAIR_WEEKLY_LIMIT votes for the same target in 7 days", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        { targetCharId: "target-x", reason: GOOD_REASON, ts: now - 3 * 24 * 60 * 60 * 1000 },
        { targetCharId: "target-x", reason: GOOD_REASON, ts: now - 2 * 24 * 60 * 60 * 1000 },
      ],
    };
    const r = canVote(voter, "target-x", GOOD_REASON, now);
    assertEquals(r.ok, true, "two prior votes should still allow a third");
  });

  it("blocks the 4th vote for the same target within 7 days", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: Array.from({ length: PER_PAIR_WEEKLY_LIMIT }, (_, i) => ({
        targetCharId: "target-x", reason: GOOD_REASON,
        ts: now - (i + 1) * 24 * 60 * 60 * 1000,
      })),
    };
    const r = canVote(voter, "target-x", GOOD_REASON, now);
    assertEquals(r.ok, false);
    assert(r.message.toLowerCase().includes("week"));
  });

  it("allows another vote for a target once a week-old entry expires", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        // oldest vote falls outside the 7-day window
        { targetCharId: "target-x", reason: GOOD_REASON, ts: now - WEEKLY_WINDOW_MS - 1 },
        { targetCharId: "target-x", reason: GOOD_REASON, ts: now - 3 * 24 * 60 * 60 * 1000 },
        { targetCharId: "target-x", reason: GOOD_REASON, ts: now - 2 * 24 * 60 * 60 * 1000 },
      ],
    };
    const r = canVote(voter, "target-x", GOOD_REASON, now);
    assertEquals(r.ok, true);
  });
});

describe("votesForTargetThisWeek", () => {
  it("counts only entries inside the rolling 7-day window", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        { targetCharId: "x", reason: GOOD_REASON, ts: now - 1 * 24 * 60 * 60 * 1000 },
        { targetCharId: "x", reason: GOOD_REASON, ts: now - 6 * 24 * 60 * 60 * 1000 },
        { targetCharId: "x", reason: GOOD_REASON, ts: now - WEEKLY_WINDOW_MS - 1 },
        { targetCharId: "y", reason: GOOD_REASON, ts: now - 1 * 24 * 60 * 60 * 1000 },
      ],
    };
    assertEquals(votesForTargetThisWeek(voter, "x", now), 2);
    assertEquals(votesForTargetThisWeek(voter, "y", now), 1);
    assertEquals(votesForTargetThisWeek(voter, "z", now), 0);
  });
});

describe("recordVote", () => {
  it("appends an entry and does not mutate", () => {
    const now = 1234;
    const before = { ...base, voteHistory: [] };
    const after = recordVote(before, "tgt", GOOD_REASON, now);
    assertEquals(before.voteHistory!.length, 0);
    assertEquals(after.voteHistory!.length, 1);
    assertEquals(after.voteHistory![0].targetCharId, "tgt");
    assertEquals(after.voteHistory![0].ts, now);
    assertEquals(after.voteHistory![0].reason, GOOD_REASON);
  });

  it("trims the reason", () => {
    const after = recordVote(base, "tgt", `   ${GOOD_REASON}   `);
    assertEquals(after.voteHistory![0].reason, GOOD_REASON);
  });

  it("caps history at 100 rolling entries", () => {
    const huge = Array.from({ length: 105 }, (_, i) => ({
      targetCharId: `t${i}`, reason: GOOD_REASON, ts: i,
    }));
    const after = recordVote({ ...base, voteHistory: huge }, "new", GOOD_REASON, 999);
    assertEquals(after.voteHistory!.length, 100);
    assertEquals(after.voteHistory![99].targetCharId, "new");
  });
});

describe("votesToday + lastVoteFor", () => {
  it("votesToday returns only 24h-window entries", () => {
    const now = 1_000_000_000_000;
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        { targetCharId: "t1", reason: GOOD_REASON, ts: now - 1000 },
        { targetCharId: "t2", reason: GOOD_REASON, ts: now - DAILY_WINDOW_MS - 1 },
      ],
    };
    const today = votesToday(voter, now);
    assertEquals(today.length, 1);
    assertEquals(today[0].targetCharId, "t1");
  });

  it("lastVoteFor returns max ts for matches or 0", () => {
    const voter: IWoDChar = {
      ...base,
      voteHistory: [
        { targetCharId: "x", reason: GOOD_REASON, ts: 100 },
        { targetCharId: "x", reason: GOOD_REASON, ts: 500 },
        { targetCharId: "y", reason: GOOD_REASON, ts: 999 },
      ],
    };
    assertEquals(lastVoteFor(voter, "x"), 500);
    assertEquals(lastVoteFor(voter, "z"), 0);
  });
});

describe("constants", () => {
  it("VOTE_XP_AMOUNT is a fractional trickle (0.20)", () => {
    assertEquals(VOTE_XP_AMOUNT, 0.20);
  });
  it("daily cap is a generous safety ceiling", () => {
    assertEquals(DAILY_VOTE_CAP, 10);
  });
  it("per-pair weekly limit is 3 in a 7-day window", () => {
    assertEquals(PER_PAIR_WEEKLY_LIMIT, 3);
    assertEquals(WEEKLY_WINDOW_MS, 7 * 24 * 60 * 60 * 1000);
  });
});
