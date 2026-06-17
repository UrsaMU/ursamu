// Tests for the Extended Action subsystem (CoFD 2e core p.70).

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  abandonExtendedAction,
  createExtendedAction,
  type ExtendedResolvePayload,
  finishExtendedAction,
  getActiveForOwner,
  getExtendedAction,
  linkContest,
  listAll,
  listForOwner,
  listForRoom,
  newExtendedAction,
  nextAttemptPenalty,
  offExtendedResolve,
  onExtendedResolve,
  recordAttempt,
} from "../src/subsystems/extended.ts";
import { parseStartArgs } from "../src/commands/extended.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const RUN_ID = crypto.randomUUID().slice(0, 8);
const U = (s: string) => `${s}-${RUN_ID}`;

function baseInput(overrides: Partial<Parameters<typeof createExtendedAction>[0]> = {}) {
  const ov = { ...overrides } as Record<string, unknown>;
  if (typeof ov.ownerId === "string") ov.ownerId = U(ov.ownerId);
  if (typeof ov.roomId === "string") ov.roomId = U(ov.roomId);
  return {
    ownerId: U("p1"),
    ownerName: "Lyra",
    roomId: U("room-1"),
    description: "Decipher the grimoire",
    pool: "intelligence+occult",
    target: 6,
    maxRolls: 4,
    interval: "scene" as const,
    cumulativePenalty: false,
    tag: "",
    ...ov,
  };
}

describe("parseStartArgs", () => {
  it("parses pool, target, maxRolls, interval, cum, description", () => {
    const p = parseStartArgs("intelligence+occult=10/8/hour/cum Decipher the grimoire");
    assertEquals(p.error, undefined);
    assertEquals(p.pool, "intelligence+occult");
    assertEquals(p.target, 10);
    assertEquals(p.maxRolls, 8);
    assertEquals(p.interval, "hour");
    assertEquals(p.cumulative, true);
    assertEquals(p.description, "Decipher the grimoire");
  });

  it("defaults maxRolls=null, interval=scene, cumulative=false", () => {
    const p = parseStartArgs("strength+stamina=15 Force the cell door");
    assertEquals(p.maxRolls, null);
    assertEquals(p.interval, "scene");
    assertEquals(p.cumulative, false);
  });

  it("rejects missing '='", () => {
    const p = parseStartArgs("intelligence+occult 10 Decipher");
    assert(p.error);
  });

  it("rejects out-of-range target", () => {
    const p = parseStartArgs("int+occult=0 nope");
    assert(p.error);
    const p2 = parseStartArgs("int+occult=51 nope");
    assert(p2.error);
  });

  it("rejects unknown option token", () => {
    const p = parseStartArgs("int+occult=10/banana stuff");
    assert(p.error);
  });

  it("rejects missing description", () => {
    const p = parseStartArgs("int+occult=10");
    assert(p.error);
  });
});

describe("newExtendedAction + DBO create/read", OPTS, () => {
  it("newExtendedAction builds an active record with sane defaults", OPTS, () => {
    const a = newExtendedAction(baseInput());
    assertEquals(a.status, "active");
    assertEquals(a.accumulated, 0);
    assertEquals(a.attempts, 0);
    assertEquals(a.attemptsLog.length, 0);
    assertEquals(a.lastRollPenalty, 0);
    assertEquals(a.contestId, null);
    assertEquals(a.resolvedAt, null);
  });

  it("createExtendedAction persists; getActiveForOwner finds it", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "owner-create" }));
    const found = await getActiveForOwner(U("owner-create"));
    assert(found, "expected active action for owner");
    assertEquals(found!.id, a.id);
  });

  it("listForOwner, listForRoom, listAll filter correctly", OPTS, async () => {
    await createExtendedAction(baseInput({ ownerId: "list-A", roomId: "list-room-X" }));
    await createExtendedAction(baseInput({ ownerId: "list-B", roomId: "list-room-X" }));
    await createExtendedAction(baseInput({ ownerId: "list-A", roomId: "list-room-Y" }));
    const mineA = await listForOwner(U("list-A"));
    assertEquals(mineA.length, 2);
    const inX = await listForRoom(U("list-room-X"));
    assertEquals(inX.length, 2);
    const all = await listAll();
    assert(all.length >= 3);
  });
});

describe("recordAttempt", OPTS, () => {
  it("accumulates successes and increments attempts", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "rec-1", target: 10, maxRolls: 10 }));
    const r1 = await recordAttempt(a, { successes: 2, exceptional: false, dramatic: false, roll: [8, 9, 3] });
    assertEquals(r1.action.accumulated, 2);
    assertEquals(r1.action.attempts, 1);
    assertEquals(r1.resolved, false);

    const r2 = await recordAttempt(r1.action, { successes: 3, exceptional: false, dramatic: false, roll: [8, 9, 10] });
    assertEquals(r2.action.accumulated, 5);
    assertEquals(r2.action.attempts, 2);
  });

  it("auto-resolves succeeded when accumulated >= target", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "rec-success", target: 3, maxRolls: 10 }));
    const r = await recordAttempt(a, { successes: 5, exceptional: true, dramatic: false, roll: [8, 9, 10, 9, 8] });
    assertEquals(r.resolved, true);
    assertEquals(r.reason, "success");
    assertEquals(r.action.status, "succeeded");
    assert(r.action.resolvedAt !== null);
  });

  it("auto-resolves failed when attempts exhausted", OPTS, async () => {
    let a = await createExtendedAction(baseInput({ ownerId: "rec-fail", target: 100, maxRolls: 2 }));
    const r1 = await recordAttempt(a, { successes: 0, exceptional: false, dramatic: false, roll: [3] });
    a = r1.action;
    const r2 = await recordAttempt(a, { successes: 0, exceptional: false, dramatic: false, roll: [4] });
    assertEquals(r2.resolved, true);
    assertEquals(r2.reason, "exhausted");
    assertEquals(r2.action.status, "failed");
  });

  it("dramatic failure sets lastRollPenalty -2 (no carry beyond next)", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "rec-dram", target: 100, maxRolls: 10 }));
    const r1 = await recordAttempt(a, { successes: 0, exceptional: false, dramatic: true, roll: [1] });
    assertEquals(r1.action.lastRollPenalty, -2);
    assertEquals(nextAttemptPenalty(r1.action), -2);

    const r2 = await recordAttempt(r1.action, { successes: 1, exceptional: false, dramatic: false, roll: [8] });
    assertEquals(r2.action.lastRollPenalty, 0);
    assertEquals(nextAttemptPenalty(r2.action), 0);
  });

  it("cumulative penalty subtracts attempts so far", () => {
    const a = newExtendedAction(baseInput({ cumulativePenalty: true }));
    assertEquals(nextAttemptPenalty(a), 0);
    const a2 = { ...a, attempts: 3 };
    assertEquals(nextAttemptPenalty(a2), -3);
    const a3 = { ...a, attempts: 2, lastRollPenalty: -2 };
    assertEquals(nextAttemptPenalty(a3), -4);
  });

  it("throws if recording on resolved action", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "rec-throw", target: 1, maxRolls: 5 }));
    const r = await recordAttempt(a, { successes: 1, exceptional: false, dramatic: false, roll: [8] });
    assertEquals(r.action.status, "succeeded");
    let threw = false;
    try {
      await recordAttempt(r.action, { successes: 1, exceptional: false, dramatic: false, roll: [8] });
    } catch {
      threw = true;
    }
    assert(threw);
  });
});

describe("abandon / finish", OPTS, () => {
  it("abandonExtendedAction transitions active -> abandoned", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "ab-1" }));
    const out = await abandonExtendedAction(a.id);
    assertEquals(out?.status, "abandoned");
    const reload = await getExtendedAction(a.id);
    assertEquals(reload?.status, "abandoned");
  });

  it("finishExtendedAction forces succeeded and bumps accumulated to target", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "fin-1", target: 50, maxRolls: 20 }));
    const out = await finishExtendedAction(a.id);
    assertEquals(out?.status, "succeeded");
    assert((out?.accumulated ?? 0) >= 50);
  });
});

describe("resolve hook", OPTS, () => {
  it("onExtendedResolve fires with payload on success", OPTS, async () => {
    const seen: ExtendedResolvePayload[] = [];
    const h = (p: ExtendedResolvePayload) => { seen.push(p); };
    onExtendedResolve(h);
    try {
      const a = await createExtendedAction(baseInput({ ownerId: "hook-1", target: 1, maxRolls: 5, tag: "ritual" }));
      await recordAttempt(a, { successes: 2, exceptional: false, dramatic: false, roll: [8, 9] });
      const ours = seen.filter((p) => p.ownerId === U("hook-1"));
      assertEquals(ours.length, 1);
      assertEquals(ours[0].status, "succeeded");
      assertEquals(ours[0].tag, "ritual");
    } finally {
      offExtendedResolve(h);
    }
  });

  it("offExtendedResolve removes the handler", OPTS, async () => {
    let fired = 0;
    const h = () => { fired += 1; };
    onExtendedResolve(h);
    offExtendedResolve(h);
    const a = await createExtendedAction(baseInput({ ownerId: "hook-off", target: 1, maxRolls: 5 }));
    await recordAttempt(a, { successes: 1, exceptional: false, dramatic: false, roll: [8] });
    assertEquals(fired, 0);
  });
});

describe("contested pair", OPTS, () => {
  it("linkContest pairs two active actions", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "c-A", target: 10, maxRolls: 10 }));
    const b = await createExtendedAction(baseInput({ ownerId: "c-B", target: 10, maxRolls: 10 }));
    const ok = await linkContest(a.id, b.id);
    assertEquals(ok, true);
    const ra = await getExtendedAction(a.id);
    const rb = await getExtendedAction(b.id);
    assert(ra?.contestId);
    assertEquals(ra?.contestId, rb?.contestId);
  });

  it("winner auto-abandons sibling", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "c-WIN", target: 2, maxRolls: 5 }));
    const b = await createExtendedAction(baseInput({ ownerId: "c-LOSE", target: 100, maxRolls: 50 }));
    await linkContest(a.id, b.id);
    const ra = await getExtendedAction(a.id);
    const out = await recordAttempt(ra!, { successes: 2, exceptional: false, dramatic: false, roll: [8, 9] });
    assertEquals(out.action.status, "succeeded");
    const rb = await getExtendedAction(b.id);
    assertEquals(rb?.status, "abandoned");
  });

  it("linkContest rejects same id or non-active", OPTS, async () => {
    const a = await createExtendedAction(baseInput({ ownerId: "c-same", target: 5, maxRolls: 5 }));
    assertEquals(await linkContest(a.id, a.id), false);
    await abandonExtendedAction(a.id);
    const b = await createExtendedAction(baseInput({ ownerId: "c-other", target: 5, maxRolls: 5 }));
    assertEquals(await linkContest(a.id, b.id), false);
  });
});
