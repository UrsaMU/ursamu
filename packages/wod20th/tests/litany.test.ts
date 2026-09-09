// tests/litany.test.ts -- Litany data integrity + +litany command flows.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../commands/litany.ts";

import {
  allLaws,
  getLaw,
  LITANY_LAWS,
} from "../splats/wta/data/litany.ts";
import {
  _deleteChargeForTest,
  findAllCharges,
  findCharge,
  findChargesByTarget,
} from "../db/litanyDb.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
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
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  return Object.assign({
    me: opts.me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+litany", original: "", args: opts.args ?? [], switches: [] },
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

async function makeChar(
  playerId: string,
  splat: SplatId,
  patch: Partial<IWoDChar> = {},
): Promise<IWoDChar> {
  await createChar(playerId, splat);
  const c = (await findByPlayer(playerId))!;
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  Object.assign(fresh, patch);
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

async function clearChargesFor(targetCharId: string): Promise<void> {
  const rows = await findChargesByTarget(targetCharId);
  for (const r of rows) await _deleteChargeForTest(r.id);
}

function sentStr(u: { _sent: Array<{ msg: string }> }): string {
  return u._sent.map((x) => x.msg).join("\n");
}

// -- Data integrity ---------------------------------------------------------

Deno.test("LITANY_LAWS: exactly 13 laws, slugs law-1..law-13", OPTS, () => {
  const laws = allLaws();
  assertEquals(laws.length, 13);
  const slugs = laws.map((l) => l.slug);
  for (let i = 1; i <= 13; i++) {
    assert(slugs.includes(`law-${i}`), `missing law-${i}`);
  }
});

Deno.test("LITANY_LAWS: kebab slugs, valid severity, penalty.amount>=1", OPTS, () => {
  for (const l of allLaws()) {
    assert(/^law-\d+$/.test(l.slug), `bad slug ${l.slug}`);
    assert(["minor", "major", "grave"].includes(l.severity), `bad severity on ${l.slug}`);
    assert(["glory", "honor", "wisdom"].includes(l.penalty.track));
    assert(l.penalty.amount >= 1, `penalty<1 on ${l.slug}`);
    assert(l.name.length > 0 && l.text.length > 0);
  }
});

Deno.test("getLaw: prototype-pollution guard", OPTS, () => {
  assertEquals(getLaw("toString"), undefined);
  assertEquals(getLaw("__proto__"), undefined);
  assertEquals(getLaw("constructor"), undefined);
  assertEquals(getLaw(""), undefined);
  assert(getLaw("law-1") !== undefined);
  assert(getLaw(Object.keys(LITANY_LAWS)[0]) !== undefined);
});

// -- /charge gates ----------------------------------------------------------

Deno.test("+litany/charge: non-wta accuser rejected", OPTS, async () => {
  await makeChar("lit-mortal-acc-1", "mortal");
  const target = await makeChar("lit-target-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-mortal-acc-1", name: "MortalAcc" }),
    args: ["charge", "Target=law-9/A reason that is long enough to pass."],
    targetResult: { id: "lit-target-1", name: "Target", flags: new Set(["player"]) } as IDBObj,
  });
  await exec(u);
  assert(/Only the Garou/i.test(sentStr(u as unknown as { _sent: { msg: string }[] })));
  const rows = await findChargesByTarget(target.id);
  assertEquals(rows.length, 0);
});

Deno.test("+litany/charge: rank<1 rejected", OPTS, async () => {
  const accuser = await makeChar("lit-r0-acc-1", "wta", { rank: undefined });
  const target = await makeChar("lit-r0-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-r0-acc-1", name: "R0" }),
    args: ["charge", "Target=law-3/Trespassed on the bawn without a howl."],
    targetResult: { id: "lit-r0-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj,
  });
  await exec(u);
  assert(/Rank 1\+/i.test(sentStr(u as unknown as { _sent: { msg: string }[] })));
  assertEquals((await findChargesByTarget(target.id)).length, 0);
  void accuser;
});

Deno.test("+litany/charge: frenzied accuser rejected", OPTS, async () => {
  const accuser = await makeChar("lit-fr-acc-1", "wta", {
    rank: 2,
    frenzyState: "berserk",
    frenzyUntil: Date.now() + 600000,
  });
  const target = await makeChar("lit-fr-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-fr-acc-1", name: "Frenzied" }),
    args: ["charge", "Target=law-3/Trespassed on the bawn without warning."],
    targetResult: { id: "lit-fr-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj,
  });
  await exec(u);
  assert(/frenzied/i.test(sentStr(u as unknown as { _sent: { msg: string }[] })));
  assertEquals((await findChargesByTarget(target.id)).length, 0);
  void accuser;
});

Deno.test("+litany/charge: self-charge rejected", OPTS, async () => {
  const self = await makeChar("lit-self-1", "wta", { rank: 2 });
  await clearChargesFor(self.id);
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-self-1", name: "Self" }),
    args: ["charge", "Self=law-3/Trespassed on my own bawn somehow."],
    targetResult: { id: "lit-self-1", name: "Self", flags: new Set(["player"]) } as IDBObj,
  });
  await exec(u);
  assert(/cannot charge yourself/i.test(sentStr(u as unknown as { _sent: { msg: string }[] })));
  assertEquals((await findChargesByTarget(self.id)).length, 0);
});

Deno.test("+litany/charge: short reason rejected", OPTS, async () => {
  await makeChar("lit-sr-acc-1", "wta", { rank: 2 });
  const target = await makeChar("lit-sr-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-sr-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-3/short"],
    targetResult: { id: "lit-sr-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj,
  });
  await exec(u);
  assert(/at least 10 characters/i.test(sentStr(u as unknown as { _sent: { msg: string }[] })));
  assertEquals((await findChargesByTarget(target.id)).length, 0);
});

Deno.test("+litany/charge: duplicate (accuser,target,law) rejected", OPTS, async () => {
  await makeChar("lit-dup-acc-1", "wta", { rank: 2 });
  const target = await makeChar("lit-dup-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const tgtObj = { id: "lit-dup-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj;

  const u1 = mockU({
    me: mockPlayer({ id: "lit-dup-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-3/First charge with sufficient detail."],
    targetResult: tgtObj,
  });
  await exec(u1);
  assertEquals((await findChargesByTarget(target.id)).length, 1);

  const u2 = mockU({
    me: mockPlayer({ id: "lit-dup-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-3/Second charge same law same target."],
    targetResult: tgtObj,
  });
  await exec(u2);
  assert(/already have an open/i.test(sentStr(u2 as unknown as { _sent: { msg: string }[] })));
  assertEquals((await findChargesByTarget(target.id)).length, 1);
});

// -- /uphold ----------------------------------------------------------------

Deno.test("+litany/uphold: non-staff rejected without DB write", OPTS, async () => {
  await makeChar("lit-uh-acc-1", "wta", { rank: 2 });
  const target = await makeChar("lit-uh-tgt-1", "wta", {
    rank: 1,
    renown: { glory: 2, honor: 2, wisdom: 2 },
    renownTemp: { glory: 0, honor: 0, wisdom: 0 },
  });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const tgtObj = { id: "lit-uh-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj;
  const u1 = mockU({
    me: mockPlayer({ id: "lit-uh-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-9/Shifted in front of mortals at the bar."],
    targetResult: tgtObj,
  });
  await exec(u1);
  const charges = await findChargesByTarget(target.id);
  assertEquals(charges.length, 1);

  // Non-staff attempts /uphold.
  const u2 = mockU({
    me: mockPlayer({ id: "lit-uh-acc-1", name: "Acc" }),
    args: ["uphold", charges[0].id],
  });
  await exec(u2);
  assert(/Permission denied/i.test(sentStr(u2 as unknown as { _sent: { msg: string }[] })));

  const fresh = (await findByPlayer("lit-uh-tgt-1"))!;
  assertEquals(fresh.renown?.wisdom, 2, "no renown change on rejected uphold");
  const charge = await findCharge(charges[0].id);
  assertEquals(charge?.status, "pending");
});

Deno.test("+litany/uphold: staff applies renown penalty + sets status", OPTS, async () => {
  await makeChar("lit-up-acc-1", "wta", { rank: 2 });
  const target = await makeChar("lit-up-tgt-1", "wta", {
    rank: 1,
    renown: { glory: 2, honor: 2, wisdom: 2 },
    renownTemp: { glory: 0, honor: 0, wisdom: 1 },
  });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const tgtObj = { id: "lit-up-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj;
  const u1 = mockU({
    me: mockPlayer({ id: "lit-up-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-9/Shifted Crinos before mortals near the highway."],
    targetResult: tgtObj,
  });
  await exec(u1);
  const charges = await findChargesByTarget(target.id);
  assertEquals(charges.length, 1);

  // Staff uphold. law-9 -> -3 wisdom.
  const staff = mockPlayer({
    id: "lit-up-staff-1", name: "Staff",
    flags: new Set(["player", "connected", "admin"]),
  });
  const u2 = mockU({ me: staff, args: ["uphold", charges[0].id] });
  await exec(u2);

  const fresh = (await findByPlayer("lit-up-tgt-1"))!;
  // wisdom temp was 1, perm was 2, penalty 3 -> temp=0, perm=0
  assertEquals(fresh.renownTemp?.wisdom, 0);
  assertEquals(fresh.renown?.wisdom, 0);
  // Unaffected tracks unchanged.
  assertEquals(fresh.renown?.glory, 2);
  assertEquals(fresh.renown?.honor, 2);

  const charge = await findCharge(charges[0].id);
  assertEquals(charge?.status, "upheld");
  assertEquals(charge?.resolverCharId, staff.id);
});

// -- /dismiss --------------------------------------------------------------

Deno.test("+litany/dismiss: staff dismisses and charges accuser 0.5 Honor", OPTS, async () => {
  const accuser = await makeChar("lit-dm-acc-1", "wta", {
    rank: 2,
    renownTemp: { glory: 0, honor: 2, wisdom: 0 },
  });
  const target = await makeChar("lit-dm-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);
  const exec = getExec("+litany");
  const tgtObj = { id: "lit-dm-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj;
  const u1 = mockU({
    me: mockPlayer({ id: "lit-dm-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-3/Crossed the bawn without howling at all."],
    targetResult: tgtObj,
  });
  await exec(u1);
  const charges = await findChargesByTarget(target.id);
  assertEquals(charges.length, 1);

  const staff = mockPlayer({
    id: "lit-dm-staff-1", name: "Staff",
    flags: new Set(["player", "connected", "wizard"]),
  });
  const u2 = mockU({ me: staff, args: ["dismiss", charges[0].id] });
  await exec(u2);

  const freshAcc = (await findByPlayer("lit-dm-acc-1"))!;
  assertEquals(freshAcc.renownTemp?.honor, 1.5);
  const charge = await findCharge(charges[0].id);
  assertEquals(charge?.status, "dismissed");
  void accuser;
});

// -- /withdraw -------------------------------------------------------------

Deno.test("+litany/withdraw: only accuser, only while pending", OPTS, async () => {
  await makeChar("lit-wd-acc-1", "wta", { rank: 2 });
  await makeChar("lit-wd-other-1", "wta", { rank: 2 });
  const target = await makeChar("lit-wd-tgt-1", "wta", { rank: 1 });
  await clearChargesFor(target.id);

  const exec = getExec("+litany");
  const tgtObj = { id: "lit-wd-tgt-1", name: "Target", flags: new Set(["player"]) } as IDBObj;

  const u1 = mockU({
    me: mockPlayer({ id: "lit-wd-acc-1", name: "Acc" }),
    args: ["charge", "Target=law-3/Wandered into the bawn yet again, alone."],
    targetResult: tgtObj,
  });
  await exec(u1);
  const charges = await findChargesByTarget(target.id);
  assertEquals(charges.length, 1);
  const id = charges[0].id;

  // Non-accuser cannot withdraw.
  const u2 = mockU({
    me: mockPlayer({ id: "lit-wd-other-1", name: "Other" }),
    args: ["withdraw", id],
  });
  await exec(u2);
  assert(/Only the accuser/i.test(sentStr(u2 as unknown as { _sent: { msg: string }[] })));
  let charge = await findCharge(id);
  assertEquals(charge?.status, "pending");

  // Accuser withdraws.
  const u3 = mockU({
    me: mockPlayer({ id: "lit-wd-acc-1", name: "Acc" }),
    args: ["withdraw", id],
  });
  await exec(u3);
  charge = await findCharge(id);
  assertEquals(charge?.status, "withdrawn");

  // Second withdraw rejected (already resolved).
  const u4 = mockU({
    me: mockPlayer({ id: "lit-wd-acc-1", name: "Acc" }),
    args: ["withdraw", id],
  });
  await exec(u4);
  assert(/already withdrawn/i.test(sentStr(u4 as unknown as { _sent: { msg: string }[] })));
});

// -- /list + /info smoke ---------------------------------------------------

Deno.test("+litany (no switch): lists all 13 laws", OPTS, async () => {
  await makeChar("lit-ls-1", "wta", { rank: 1 });
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-ls-1", name: "Browser" }),
    args: ["", ""],
  });
  await exec(u);
  const out = sentStr(u as unknown as { _sent: { msg: string }[] });
  for (let i = 1; i <= 13; i++) assert(out.includes(`law-${i}`), `missing law-${i}`);
});

Deno.test("+litany/info <slug>: shows law text + penalty", OPTS, async () => {
  await makeChar("lit-if-1", "wta", { rank: 1 });
  const exec = getExec("+litany");
  const u = mockU({
    me: mockPlayer({ id: "lit-if-1", name: "Browser" }),
    args: ["info", "law-1"],
  });
  await exec(u);
  const out = sentStr(u as unknown as { _sent: { msg: string }[] });
  assert(/Garou Shall Not Mate/i.test(out));
  assert(/Penalty/i.test(out));
});

// Cleanup: zap leftover charges to keep KV tidy across runs.
Deno.test("cleanup: prune litany charges from this suite", OPTS, async () => {
  const all = await findAllCharges();
  for (const c of all) {
    if (c.accuserCharId.startsWith("lit-") || c.targetCharId.startsWith("lit-")) {
      await _deleteChargeForTest(c.id);
    }
  }
});
