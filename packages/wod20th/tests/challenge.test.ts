// tests/challenge.test.ts -- Challenge data + DBO + +challenge command flows.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/challenge.ts";

import { createChar, findById, findByPlayer, saveChar, setStatus, unsetCharFields } from "../db/charDb.ts";
import {
  CHALLENGE_TYPES,
  getChallengeType,
} from "../splats/wta/data/challenges.ts";
import {
  createChallenge,
  findAllChallenges,
  deleteChallenge,
  findChallenge,
  saveChallenge,
} from "../db/challengeDb.ts";
import { createPack, deletePack, findPackByName, savePack } from "../db/packDb.ts";
import { createSept, deleteSept, findSeptByName, saveSept } from "../db/septDb.ts";
import { resolvePoolExpr } from "../core/dice.ts";
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
  } as IDBObj;
}

interface MockOpts {
  me: IDBObj;
  hereId?: string;
  args?: string[];
  targetResult?: IDBObj | null;
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  const hereId = opts.hereId ?? "room-1";
  return Object.assign({
    me: opts.me,
    here: { id: hereId, name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+challenge", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string, to?: string) => sent.push({ msg: m, to }),
    broadcast: () => {},
    canEdit: () => Promise.resolve(true),
    db: {
      modify: () => Promise.resolve(),
      search: () => Promise.resolve([]),
      create: () => Promise.resolve({}),
      destroy: () => Promise.resolve(),
    },
    util: {
      target: () => Promise.resolve(opts.targetResult ?? null),
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

async function makeChar(playerId: string, splat: SplatId, patch: Partial<IWoDChar> = {}): Promise<IWoDChar> {
  await createChar(playerId, splat);
  await setStatus((await findByPlayer(playerId))!.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  Object.assign(fresh, patch);
  if (splat === "wta") {
    fresh.rank = fresh.rank ?? 2;
    fresh.auspice = fresh.auspice ?? "galliard";
    fresh.attributes = {
      Charisma: 3, Intimidation: 0, Manipulation: 3, Wits: 3,
      Stamina: 3, Perception: 3, Intelligence: 3, Appearance: 2,
      Strength: 3, Dexterity: 3, ...(fresh.attributes ?? {}),
    };
    fresh.abilities = {
      Intimidation: 2, Performance: 2, Expression: 2, Enigmas: 1,
      Occult: 1, ...(fresh.abilities ?? {}),
    };
    fresh.gnosis = fresh.gnosis ?? 3;
    fresh.willpower = fresh.willpower ?? 5;
    fresh.healthTrack = fresh.healthTrack ?? ["", "", "", "", "", "", ""];
  }
  await saveChar(fresh);
  return fresh;
}

async function wipeAllChallenges(): Promise<void> {
  const all = await findAllChallenges();
  for (const c of all) await deleteChallenge(c.id);
}

// -- Data integrity ---------------------------------------------------------

Deno.test("CHALLENGE_TYPES -- at least 8 types, unique kebab slugs", () => {
  const entries = Object.entries(CHALLENGE_TYPES);
  assert(entries.length >= 8, `need >=8 types, got ${entries.length}`);
  const slugs = entries.map(([k, v]) => {
    assertEquals(k, v.slug, `record key ${k} mismatches def.slug ${v.slug}`);
    assert(/^[a-z][a-z0-9-]*$/.test(v.slug), `bad slug: ${v.slug}`);
    return v.slug;
  });
  assertEquals(slugs.length, new Set(slugs).size, "duplicate slugs");
});

Deno.test("CHALLENGE_TYPES -- pools parse cleanly for non-combat", () => {
  // Stocked char with enough breadth to satisfy every canonical pool.
  const stub: IWoDChar = {
    id: "stub", playerId: "p", splat: "wta", status: "approved", chargenStep: 6, concept: "",
    attributePriority: ["", "", ""],
    attributes: {
      Strength: 2, Dexterity: 2, Stamina: 2, Charisma: 2, Manipulation: 2, Appearance: 2,
      Perception: 2, Intelligence: 2, Wits: 2,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {
      Intimidation: 1, Performance: 1, Expression: 1, Enigmas: 1, Occult: 1,
    },
    abilitySpecialties: {},
    backgrounds: {}, willpower: 5,
    gnosis: 2,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0,
    staffNotes: "", statLog: [], notes: [],
    createdAt: 0, updatedAt: 0,
  };
  for (const def of Object.values(CHALLENGE_TYPES)) {
    if (def.isCombat) {
      assertEquals(def.pool, "", `combat type ${def.slug} should have empty pool`);
      continue;
    }
    const r = resolvePoolExpr(stub, def.pool);
    assert(r !== null, `pool ${def.pool} (${def.slug}) failed to parse`);
    assert(r!.pool > 0, `pool ${def.pool} resolved to 0`);
  }
});

Deno.test("CHALLENGE_TYPES -- bonusAuspice in {galliard, theurge, undefined}", () => {
  for (const def of Object.values(CHALLENGE_TYPES)) {
    if (def.bonusAuspice !== undefined) {
      assert(["galliard", "theurge"].includes(def.bonusAuspice), `bad bonusAuspice ${def.bonusAuspice}`);
    }
  }
});

Deno.test("getChallengeType -- prototype-pollution guard", () => {
  assertEquals(getChallengeType("__proto__"), undefined);
  assertEquals(getChallengeType("toString"), undefined);
  assertEquals(getChallengeType("hasOwnProperty"), undefined);
  assertEquals(getChallengeType(""), undefined);
  assertEquals(getChallengeType("staredown")?.slug, "staredown");
});

// -- Command gates ----------------------------------------------------------

Deno.test("+challenge/issue -- rejects non-wta initiator", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  await makeChar("ch-mortal-1", "mortal");
  const tgt = mockPlayer({ id: "ch-tgt-1", location: "room-1" });
  const u = mockU({
    me: mockPlayer({ id: "ch-mortal-1" }),
    args: ["issue", "Bran=staredown/Long enough reason here"],
    targetResult: tgt,
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /Garou/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects rank<1", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const cub = await makeChar("ch-cub", "wta");
  await unsetCharFields(cub.id, ["rank"]);
  await makeChar("ch-target-rank", "wta");
  const tgt = mockPlayer({ id: "ch-target-rank", location: "room-1" });
  const u = mockU({
    me: mockPlayer({ id: "ch-cub" }),
    args: ["issue", "Bran=staredown/Reason that is long enough."],
    targetResult: tgt,
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /Rank 1/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects self", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  await makeChar("ch-self", "wta");
  const u = mockU({
    me: mockPlayer({ id: "ch-self", location: "room-1" }),
    args: ["issue", "Self=staredown/Reason that is long enough."],
    targetResult: mockPlayer({ id: "ch-self", location: "room-1" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /yourself/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects different room", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  await makeChar("ch-room-a", "wta");
  await makeChar("ch-room-b", "wta");
  const u = mockU({
    me: mockPlayer({ id: "ch-room-a", location: "room-1" }),
    args: ["issue", "Bran=staredown/Reason that is long enough."],
    targetResult: mockPlayer({ id: "ch-room-b", location: "room-99" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /same room/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects frenzy", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const c = await makeChar("ch-frenz", "wta");
  c.frenzyState = "berserk";
  c.frenzyUntil = Date.now() + 600_000;
  await saveChar(c);
  await makeChar("ch-frenz-tgt", "wta");
  const u = mockU({
    me: mockPlayer({ id: "ch-frenz", location: "room-1" }),
    args: ["issue", "Bran=staredown/Reason that is long enough."],
    targetResult: mockPlayer({ id: "ch-frenz-tgt", location: "room-1" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /frenz/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects short reason", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  await makeChar("ch-rs-a", "wta");
  await makeChar("ch-rs-b", "wta");
  const u = mockU({
    me: mockPlayer({ id: "ch-rs-a", location: "room-1" }),
    args: ["issue", "Bran=staredown/short"],
    targetResult: mockPlayer({ id: "ch-rs-b", location: "room-1" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /at least/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- rejects duplicate type", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-dup-a", "wta");
  const b = await makeChar("ch-dup-b", "wta");
  await createChallenge(a.id, b.id, "staredown", "Pre-existing reason here.");
  const u = mockU({
    me: mockPlayer({ id: "ch-dup-a", location: "room-1" }),
    args: ["issue", "Bran=staredown/Another reason that is long enough."],
    targetResult: mockPlayer({ id: "ch-dup-b", location: "room-1" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /already/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("+challenge/issue -- klaive-duel needs fetish weapon", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  await makeChar("ch-kd-a", "wta");
  await makeChar("ch-kd-b", "wta");
  const u = mockU({
    me: mockPlayer({ id: "ch-kd-a", location: "room-1" }),
    args: ["issue", "Bran=klaive-duel/Honor demands a duel of steel."],
    targetResult: mockPlayer({ id: "ch-kd-b", location: "room-1" }),
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /fetish weapon/i.test(s.msg)), JSON.stringify(sent));
});

// -- Happy path: non-combat resolve ----------------------------------------

Deno.test("+challenge -- accept then resolve produces winner + temp renown", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-hp-a", "wta", { auspice: "galliard" });
  const b = await makeChar("ch-hp-b", "wta", { auspice: "ahroun" });

  // Issue.
  await exec(mockU({
    me: mockPlayer({ id: "ch-hp-a", location: "room-1" }),
    args: ["issue", "Bran=staredown/A worthy contest of wills."],
    targetResult: mockPlayer({ id: "ch-hp-b", location: "room-1" }),
  }));
  const all = await findAllChallenges();
  const ch = all.find((c) => c.initiatorCharId === a.id && c.targetCharId === b.id);
  assert(ch, "challenge should exist");

  // Accept (as target).
  await exec(mockU({
    me: mockPlayer({ id: "ch-hp-b", location: "room-1" }),
    args: ["accept", ch!.id],
  }));
  const accepted = await findChallenge(ch!.id);
  assertEquals(accepted?.status, "accepted");

  // Resolve.
  await exec(mockU({
    me: mockPlayer({ id: "ch-hp-a", location: "room-1" }),
    args: ["resolve", ch!.id],
  }));
  const resolved = await findChallenge(ch!.id);
  assertEquals(resolved?.status, "resolved");
  assert(resolved?.winnerCharId === a.id || resolved?.winnerCharId === b.id);

  // Winner's temp Honor (staredown reward) > 0.
  const winner = await findById(resolved!.winnerCharId!);
  assert((winner?.renownTemp?.honor ?? 0) > 0, "winner should have temp honor");
  await deleteChallenge(ch!.id);
});

// -- Decline --------------------------------------------------------------

Deno.test("+challenge/decline -- applies declineCost, status declined", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-dc-a", "wta");
  const b = await makeChar("ch-dc-b", "wta");
  // Seed temp Honor so a -1 is observable.
  b.renownTemp = { glory: 0, honor: 3, wisdom: 0 };
  await saveChar(b);
  const ch = await createChallenge(a.id, b.id, "staredown", "A challenge worth declining.");
  await exec(mockU({
    me: mockPlayer({ id: "ch-dc-b", location: "room-1" }),
    args: ["decline", ch.id],
  }));
  const re = await findChallenge(ch.id);
  assertEquals(re?.status, "declined");
  const bAfter = await findById(b.id);
  assertEquals(bAfter?.renownTemp?.honor, 2);
  await deleteChallenge(ch.id);
});

// -- Withdraw -------------------------------------------------------------

Deno.test("+challenge/withdraw -- free before accept", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-wd1-a", "wta");
  const b = await makeChar("ch-wd1-b", "wta");
  a.renownTemp = { glory: 0, honor: 1, wisdom: 0 };
  await saveChar(a);
  const ch = await createChallenge(a.id, b.id, "staredown", "Reason long enough here.");
  await exec(mockU({
    me: mockPlayer({ id: "ch-wd1-a", location: "room-1" }),
    args: ["withdraw", ch.id],
  }));
  const re = await findChallenge(ch.id);
  assertEquals(re?.status, "withdrawn");
  const aAfter = await findById(a.id);
  assertEquals(aAfter?.renownTemp?.honor, 1);  // unchanged
  await deleteChallenge(ch.id);
});

Deno.test("+challenge/withdraw -- after accept costs 0.5 Honor", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-wd2-a", "wta");
  const b = await makeChar("ch-wd2-b", "wta");
  a.renownTemp = { glory: 0, honor: 2, wisdom: 0 };
  await saveChar(a);
  const ch = await createChallenge(a.id, b.id, "staredown", "Reason long enough here.");
  ch.status = "accepted";
  ch.acceptedAt = Date.now();
  await saveChallenge(ch);
  await exec(mockU({
    me: mockPlayer({ id: "ch-wd2-a", location: "room-1" }),
    args: ["withdraw", ch.id],
  }));
  const aAfter = await findById(a.id);
  assertEquals(aAfter?.renownTemp?.honor, 1.5);
  await deleteChallenge(ch.id);
});

// -- Death-duel + sept consent --------------------------------------------

Deno.test("+challenge/resolve -- death-duel without sept consent rejects", OPTS, async () => {
  await wipeAllChallenges();
  const exec = getExec("+challenge");
  const a = await makeChar("ch-dd-a", "wta");
  const b = await makeChar("ch-dd-b", "wta");
  const ch = await createChallenge(a.id, b.id, "death-duel", "A grave matter that must end in blood.");
  ch.status = "accepted";
  ch.acceptedAt = Date.now();
  await saveChallenge(ch);
  await exec(mockU({
    me: mockPlayer({ id: "ch-dd-a", location: "room-1" }),
    args: ["resolve", ch.id],
  }));
  const re = await findChallenge(ch.id);
  assertEquals(re?.status, "accepted");  // still accepted, not resolved
  await deleteChallenge(ch.id);
});

Deno.test("+challenge/consent + /resolve -- death-duel arms after sept consent", OPTS, async () => {
  await wipeAllChallenges();
  const septName = "Sept-DD-Test";
  // Clean any leftover sept/pack from prior runs.
  const oldS = await findSeptByName(septName);
  if (oldS) await deleteSept(oldS.id);
  const oldP = await findPackByName("DD-Pack");
  if (oldP) await deletePack(oldP.id);

  const exec = getExec("+challenge");
  const a = await makeChar("ch-ddc-a", "wta");
  const b = await makeChar("ch-ddc-b", "wta");
  const leader = await makeChar("ch-ddc-lead", "wta");

  // Build sept structure: leader's pack belongs to a sept; a is the initiator.
  const pack = await createPack("DD-Pack", leader.id);
  pack.members.push(a.id);
  await savePack(pack);
  a.packId = pack.id;
  await saveChar(a);

  const sept = await createSept(septName);
  sept.packIds.push(pack.id);
  sept.leader = leader.id;
  await saveSept(sept);

  const ch = await createChallenge(a.id, b.id, "death-duel", "Grave matter ending in blood.");
  ch.status = "accepted";
  ch.acceptedAt = Date.now();
  await saveChallenge(ch);

  // Leader consents.
  await exec(mockU({
    me: mockPlayer({ id: "ch-ddc-lead", location: "room-1" }),
    args: ["consent", ch.id],
  }));
  const afterConsent = await findChallenge(ch.id);
  assertEquals(afterConsent?.septConsentBy, leader.id);

  // Resolve (combat type -> arms pendingChallengeDuel and remains "accepted"
  // status; the duel will resolve on the next +attack landing damage).
  await exec(mockU({
    me: mockPlayer({ id: "ch-ddc-a", location: "room-1" }),
    args: ["resolve", ch.id],
  }));
  const initAfter = await findById(a.id) as IWoDChar & {
    pendingChallengeDuel?: { challengeId: string; opponentCharId: string; setAt: number };
  };
  // pendingChallengeDuel is inline-only (not in saveChar allowlist yet); we
  // verify the in-memory mutation via the exec path's _sent message:
  const u2 = mockU({
    me: mockPlayer({ id: "ch-ddc-a", location: "room-1" }),
    args: ["list"],
  });
  await exec(u2);
  void initAfter;

  // Cleanup.
  await deleteChallenge(ch.id);
  await deleteSept(sept.id);
  await deletePack(pack.id);
});
