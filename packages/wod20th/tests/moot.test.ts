// tests/moot.test.ts -- Moot phase helpers, DBO CRUD, and +moot command flows.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/moot.ts";
import "../commands/sept.ts";
import "../commands/pack.ts";
import "../commands/caern.ts";

import { createChar, findById, findByPlayer, setStatus } from "../db/charDb.ts";
import {
  createCaern,
  deleteCaern,
  saveCaern,
} from "../db/caernDb.ts";
import {
  createSept,
  deleteSept,
  findSeptById,
  findSeptByName,
  saveSept,
} from "../db/septDb.ts";
import {
  createMoot,
  deleteMoot,
  findAllOpenMoots,
  findMoot,
  findMootsForSept,
  findOpenMootForSept,
  saveMoot,
} from "../db/mootDb.ts";
import {
  isMoothActive,
  MOOT_PHASE_ORDER,
  nextPhase,
  type MoothPhase,
} from "../splats/wta/data/moots.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "p-default",
    name: "Player",
    flags: new Set(["player", "connected"]),
    state: {},
    location: "room-1",
    contents: [],
    ...overrides,
  };
}

interface MockOpts {
  me: IDBObj;
  args?: string[];
  targetResult?: IDBObj | null;
  here?: { id: string; state?: Record<string, unknown> };
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  return Object.assign({
    me: opts.me,
    here: {
      id: opts.here?.id ?? "room-1",
      name: "Room",
      flags: new Set(["room"]),
      state: opts.here?.state ?? {},
      location: "",
      contents: [],
    },
    cmd: { name: "+moot", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string, to?: string) => sent.push({ msg: m, to }),
    broadcast: () => {},
    canEdit: async () => true,
    db: { modify: async () => {}, search: async () => [], create: async () => ({}), destroy: async () => {} },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent });
}

function getExec(name: string): (u: IUrsamuSDK) => Promise<void> {
  const c = cmds.find((x) => x.name === name);
  if (!c) throw new Error(`command ${name} not registered`);
  return c.exec as (u: IUrsamuSDK) => Promise<void>;
}

async function makeChar(playerId: string, splat: SplatId): Promise<IWoDChar> {
  await createChar(playerId, splat);
  const fresh = await findByPlayer(playerId);
  await setStatus(fresh!.id, "approved");
  return (await findByPlayer(playerId))!;
}

async function cleanupSept(name: string): Promise<void> {
  const s = await findSeptByName(name);
  if (s) {
    for (const m of await findMootsForSept(s.id)) await deleteMoot(m.id);
    await deleteSept(s.id);
  }
}

// ============================================================================
// Pure helpers
// ============================================================================

Deno.test("nextPhase -- canon transition table", () => {
  assertEquals(nextPhase("scheduled"), "opening-howl");
  assertEquals(nextPhase("opening-howl"), "inner-sky");
  assertEquals(nextPhase("inner-sky"), "cracking-the-bone");
  assertEquals(nextPhase("cracking-the-bone"), "revel");
  assertEquals(nextPhase("revel"), "closed");
  assertEquals(nextPhase("closed"), null);
  // Invalid:
  assertEquals(nextPhase("bogus" as MoothPhase), null);
});

Deno.test("MOOT_PHASE_ORDER -- canonical ordering", () => {
  assertEquals(MOOT_PHASE_ORDER, [
    "scheduled",
    "opening-howl",
    "inner-sky",
    "cracking-the-bone",
    "revel",
    "closed",
  ]);
});

Deno.test("isMoothActive -- only in-session phases", () => {
  assertEquals(isMoothActive("scheduled"), false);
  assertEquals(isMoothActive("opening-howl"), true);
  assertEquals(isMoothActive("inner-sky"), true);
  assertEquals(isMoothActive("cracking-the-bone"), true);
  assertEquals(isMoothActive("revel"), true);
  assertEquals(isMoothActive("closed"), false);
});

// ============================================================================
// DBO CRUD
// ============================================================================

Deno.test("mootDb -- create / findMoot / saveMoot roundtrip", OPTS, async () => {
  const sept = await createSept("Moot-DBO-Sept");
  const m = await createMoot(sept.id, 1700000000000, "Saturday");
  assertEquals(m.phase, "scheduled");
  assertEquals(m.attendees, []);
  const re = await findMoot(m.id);
  assertEquals(re?.septId, sept.id);

  re!.phase = "opening-howl";
  re!.attendees = ["c-1", "c-2"];
  re!.renownAwards = [{ charId: "c-1", track: "honor", amount: 1, reason: "n/a", awardedAt: 1 }];
  await saveMoot(re!);
  const re2 = await findMoot(m.id);
  assertEquals(re2?.phase, "opening-howl");
  assertEquals(re2?.attendees, ["c-1", "c-2"]);
  assertEquals(re2?.renownAwards.length, 1);

  await deleteMoot(m.id);
  await deleteSept(sept.id);
});

Deno.test("mootDb -- findOpenMootForSept ignores scheduled/closed", OPTS, async () => {
  const sept = await createSept("Moot-Open-Sept");
  const a = await createMoot(sept.id, 1700000000000);
  const b = await createMoot(sept.id, 1700000000001);
  b.phase = "inner-sky"; await saveMoot(b);
  const open = await findOpenMootForSept(sept.id);
  assertEquals(open?.id, b.id);

  // Closing the open moot clears the result.
  b.phase = "closed"; await saveMoot(b);
  assertEquals(await findOpenMootForSept(sept.id), null);

  await deleteMoot(a.id); await deleteMoot(b.id);
  await deleteSept(sept.id);
});

Deno.test("mootDb -- findAllOpenMoots scans every sept", OPTS, async () => {
  const s1 = await createSept("Moot-Multi-A");
  const s2 = await createSept("Moot-Multi-B");
  const m1 = await createMoot(s1.id, 1);
  const m2 = await createMoot(s2.id, 2);
  m1.phase = "revel"; await saveMoot(m1);
  m2.phase = "scheduled"; await saveMoot(m2);
  const open = await findAllOpenMoots();
  const ids = open.map((m) => m.id);
  assert(ids.includes(m1.id));
  assert(!ids.includes(m2.id));
  await deleteMoot(m1.id); await deleteMoot(m2.id);
  await deleteSept(s1.id); await deleteSept(s2.id);
});

// ============================================================================
// Command gates
// ============================================================================

Deno.test("+moot/schedule -- rejects non-staff non-MotH", OPTS, async () => {
  await cleanupSept("Sched-Reject-Sept");
  const exec = getExec("+moot");
  const sept = await createSept("Sched-Reject-Sept");
  const stranger = await makeChar("moot-stranger-1", "wta");
  const u = mockU({
    me: mockPlayer({ id: stranger.playerId }),
    args: ["schedule", "Sched-Reject-Sept=Saturday"],
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/Only staff or the sept's Master of the Howl/.test(out));
  assertEquals((await findMootsForSept(sept.id)).length, 0);
  await deleteSept(sept.id);
});

Deno.test("+moot/schedule -- missing sept rejected", OPTS, async () => {
  const exec = getExec("+moot");
  const u = mockU({
    me: mockPlayer({ id: "staff-x", flags: new Set(["player", "connected", "admin"]) }),
    args: ["schedule", "No-Such-Sept=When"],
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/No sept named/.test(out));
});

Deno.test("+moot/schedule -- Master of the Howl may schedule", OPTS, async () => {
  await cleanupSept("Sched-Moth-Sept");
  const exec = getExec("+moot");
  const moth = await makeChar("moot-moth-1", "wta");
  const sept = await createSept("Sched-Moth-Sept");
  sept.positions[moth.id] = "Master of the Howl";
  await saveSept(sept);
  await exec(mockU({
    me: mockPlayer({ id: moth.playerId }),
    args: ["schedule", "Sched-Moth-Sept=Friday"],
  }));
  assertEquals((await findMootsForSept(sept.id)).length, 1);
  await cleanupSept("Sched-Moth-Sept");
});

Deno.test("+moot/open -- must be in caern room of the sept", OPTS, async () => {
  await cleanupSept("Open-Wrong-Sept");
  const exec = getExec("+moot");
  const sept = await createSept("Open-Wrong-Sept");
  const moot = await createMoot(sept.id, Date.now(), "soon");
  // No caern bound to the room.
  const u = mockU({
    me: mockPlayer({ id: "staff-o", flags: new Set(["player", "connected", "admin"]) }),
    args: ["open", ""],
    here: { id: "no-caern-room" },
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/caern-bound room/.test(out));
  // moot stays scheduled
  const after = await findMoot(moot.id);
  assertEquals(after?.phase, "scheduled");
  await deleteMoot(moot.id);
  await deleteSept(sept.id);
});

Deno.test("+moot/open -- enforces one open moot per sept", OPTS, async () => {
  await cleanupSept("Open-Dup-Sept");
  const exec = getExec("+moot");
  const caern = await createCaern("Open-Dup-Caern", 3, "Wisdom");
  caern.locationRoomId = "room-dup";
  await saveCaern(caern);
  const sept = await createSept("Open-Dup-Sept");
  sept.caernId = caern.id; await saveSept(sept);

  const m1 = await createMoot(sept.id, Date.now(), "first");
  m1.phase = "inner-sky"; await saveMoot(m1); // already open
  const m2 = await createMoot(sept.id, Date.now() + 1, "second");

  const u = mockU({
    me: mockPlayer({ id: "staff-d2", flags: new Set(["player", "connected", "admin"]) }),
    args: ["open", ""],
    here: { id: "room-dup" },
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/already has an open moot/.test(out));
  const after = await findMoot(m2.id);
  assertEquals(after?.phase, "scheduled");

  await deleteMoot(m1.id); await deleteMoot(m2.id);
  await deleteSept(sept.id);
  await deleteCaern(caern.id);
});

Deno.test("+moot/attend -- idempotent and gated on active phase", OPTS, async () => {
  await cleanupSept("Att-Sept");
  const exec = getExec("+moot");
  const caern = await createCaern("Att-Caern", 2, "Honor");
  caern.locationRoomId = "room-att"; await saveCaern(caern);
  const sept = await createSept("Att-Sept");
  sept.caernId = caern.id; await saveSept(sept);
  const moot = await createMoot(sept.id, Date.now(), "now");
  // Scheduled -- attend should be rejected.
  const garou = await makeChar("moot-att-1", "wta");

  const u1 = mockU({
    me: mockPlayer({ id: garou.playerId }),
    args: ["attend", ""],
    here: { id: "room-att" },
  });
  await exec(u1);
  const out1 = (u1 as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/No active moot|not currently in session/.test(out1));

  moot.phase = "opening-howl"; await saveMoot(moot);

  const u2 = mockU({
    me: mockPlayer({ id: garou.playerId }),
    args: ["attend", ""],
    here: { id: "room-att" },
  });
  await exec(u2);
  const after = await findMoot(moot.id);
  assertEquals(after?.attendees, [garou.id]);

  // Idempotent -- second call replies "Already attending."
  const u3 = mockU({
    me: mockPlayer({ id: garou.playerId }),
    args: ["attend", ""],
    here: { id: "room-att" },
  });
  await exec(u3);
  const out3 = (u3 as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/Already attending/.test(out3));
  const after2 = await findMoot(moot.id);
  assertEquals(after2?.attendees.length, 1);

  await deleteMoot(moot.id); await deleteSept(sept.id); await deleteCaern(caern.id);
});

Deno.test("+moot/phase -- staff advances; invalid rejected", OPTS, async () => {
  await cleanupSept("Phase-Sept");
  const exec = getExec("+moot");
  const caern = await createCaern("Phase-Caern", 1, "Wisdom");
  caern.locationRoomId = "room-phase"; await saveCaern(caern);
  const sept = await createSept("Phase-Sept");
  sept.caernId = caern.id; await saveSept(sept);
  const moot = await createMoot(sept.id, Date.now());
  moot.phase = "opening-howl"; await saveMoot(moot);

  // Bad arg
  const bad = mockU({
    me: mockPlayer({ id: "staff-p", flags: new Set(["player", "connected", "admin"]) }),
    args: ["phase", "ragnarok"],
    here: { id: "room-phase" },
  });
  await exec(bad);
  const outBad = (bad as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/Usage:/.test(outBad));

  // Good: next
  await exec(mockU({
    me: mockPlayer({ id: "staff-p", flags: new Set(["player", "connected", "admin"]) }),
    args: ["phase", "next"],
    here: { id: "room-phase" },
  }));
  let re = await findMoot(moot.id);
  assertEquals(re?.phase, "inner-sky");

  // Good: explicit jump
  await exec(mockU({
    me: mockPlayer({ id: "staff-p", flags: new Set(["player", "connected", "admin"]) }),
    args: ["phase", "revel"],
    here: { id: "room-phase" },
  }));
  re = await findMoot(moot.id);
  assertEquals(re?.phase, "revel");

  await deleteMoot(moot.id); await deleteSept(sept.id); await deleteCaern(caern.id);
});

Deno.test("+moot/award -- staff only and only during bone/revel", OPTS, async () => {
  await cleanupSept("Award-Sept");
  const exec = getExec("+moot");
  const caern = await createCaern("Award-Caern", 1, "Wisdom");
  caern.locationRoomId = "room-award"; await saveCaern(caern);
  const sept = await createSept("Award-Sept");
  sept.caernId = caern.id; await saveSept(sept);
  const moot = await createMoot(sept.id, Date.now());
  moot.phase = "opening-howl"; await saveMoot(moot);

  const target = await makeChar("moot-target-1", "wta");
  const targetDB = mockPlayer({ id: target.playerId, name: "Target" });

  // Non-staff -> rejected.
  const stranger = await makeChar("moot-stranger-2", "wta");
  const u1 = mockU({
    me: mockPlayer({ id: stranger.playerId }),
    args: ["award", "Target=honor:1 bravery"],
    here: { id: "room-award" },
    targetResult: targetDB,
  });
  await exec(u1);
  const out1 = (u1 as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/Permission denied/.test(out1));

  // Wrong phase (opening-howl).
  const u2 = mockU({
    me: mockPlayer({ id: "staff-a", flags: new Set(["player", "connected", "admin"]) }),
    args: ["award", "Target=honor:1 bravery"],
    here: { id: "room-award" },
    targetResult: targetDB,
  });
  await exec(u2);
  const out2 = (u2 as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/Cracking the Bone or the Revel/.test(out2));

  // Move to bone and try again.
  moot.phase = "cracking-the-bone"; await saveMoot(moot);
  await exec(mockU({
    me: mockPlayer({ id: "staff-a", flags: new Set(["player", "connected", "admin"]) }),
    args: ["award", "Target=honor:2 spoke truth"],
    here: { id: "room-award" },
    targetResult: targetDB,
  }));
  const tre = await findById(target.id);
  assertEquals(tre?.renownTemp?.honor, 2);
  const re = await findMoot(moot.id);
  assertEquals(re?.renownAwards.length, 1);
  assertEquals(re?.renownAwards[0].track, "honor");
  assertEquals(re?.renownAwards[0].amount, 2);

  await deleteMoot(moot.id); await deleteSept(sept.id); await deleteCaern(caern.id);
});

Deno.test("+moot/close -- awards +0.5 temp Honor to every attendee", OPTS, async () => {
  await cleanupSept("Close-Sept");
  const exec = getExec("+moot");
  const caern = await createCaern("Close-Caern", 1, "Honor");
  caern.locationRoomId = "room-close"; await saveCaern(caern);
  const sept = await createSept("Close-Sept");
  sept.caernId = caern.id; await saveSept(sept);
  const moot = await createMoot(sept.id, Date.now());
  moot.phase = "revel";
  const a = await makeChar("moot-close-a", "wta");
  const b = await makeChar("moot-close-b", "wta");
  moot.attendees = [a.id, b.id];
  await saveMoot(moot);

  await exec(mockU({
    me: mockPlayer({ id: "staff-c", flags: new Set(["player", "connected", "admin"]) }),
    args: ["close", ""],
    here: { id: "room-close" },
  }));
  const ra = await findById(a.id);
  const rb = await findById(b.id);
  assertEquals(ra?.renownTemp?.honor, 0.5);
  assertEquals(rb?.renownTemp?.honor, 0.5);
  const re = await findMoot(moot.id);
  assertEquals(re?.phase, "closed");
  assert(re?.closedAt && re.closedAt > 0);
  // Two attendee closing awards recorded.
  const closingAwards = (re?.renownAwards ?? []).filter((aw) => aw.amount === 0.5);
  assertEquals(closingAwards.length, 2);

  await deleteMoot(moot.id); await deleteSept(sept.id); await deleteCaern(caern.id);
});

Deno.test("+moot list -- shows open moots only", OPTS, async () => {
  await cleanupSept("List-Sept");
  const exec = getExec("+moot");
  const sept = await createSept("List-Sept");
  const open = await createMoot(sept.id, Date.now(), "open");
  open.phase = "revel"; await saveMoot(open);
  const closed = await createMoot(sept.id, Date.now(), "old");
  closed.phase = "closed"; await saveMoot(closed);

  const u = mockU({
    me: mockPlayer({ id: "staff-l2", flags: new Set(["player", "connected", "admin"]) }),
    args: ["list", ""],
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent.map((s) => s.msg).join("\n");
  assert(/List-Sept/.test(out));

  await deleteMoot(open.id); await deleteMoot(closed.id);
  await deleteSept(sept.id);
});
