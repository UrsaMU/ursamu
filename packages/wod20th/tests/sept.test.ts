// tests/sept.test.ts -- Sept DBO + +sept command flows.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/sept.ts";
import "../commands/pack.ts";
import "../commands/caern.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { createPack, deletePack, savePack } from "../db/packDb.ts";
import { createCaern, deleteCaern } from "../db/caernDb.ts";
import {
  createSept,
  deleteSept,
  findAllSepts,
  findSeptByCaern,
  findSeptById,
  findSeptByName,
  findSeptByPack,
  saveSept,
} from "../db/septDb.ts";
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
    cmd: { name: "+sept", original: "", args: opts.args ?? [], switches: [] },
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
  if (s) await deleteSept(s.id);
}

// -- DBO smoke tests --------------------------------------------------------

Deno.test("septDb -- create / findByName / findById", OPTS, async () => {
  await cleanupSept("Sept-Alpha");
  const s = await createSept("Sept-Alpha");
  assertEquals(s.packIds, []);
  const byName = await findSeptByName("sept-alpha");
  assertEquals(byName?.id, s.id);
  const byId = await findSeptById(s.id);
  assertEquals(byId?.name, "Sept-Alpha");
  await deleteSept(s.id);
});

Deno.test("septDb -- saveSept persists caernId, packIds, leader, positions", OPTS, async () => {
  await cleanupSept("Persist-Sept");
  const s = await createSept("Persist-Sept");
  s.caernId = "fake-caern";
  s.packIds.push("fake-pack");
  s.leader = "fake-leader";
  s.positions["c-1"] = "Master of the Rite";
  s.notes.push("Founded 2026.");
  await saveSept(s);
  const re = await findSeptById(s.id);
  assertEquals(re?.caernId, "fake-caern");
  assertEquals(re?.packIds, ["fake-pack"]);
  assertEquals(re?.leader, "fake-leader");
  assertEquals(re?.positions["c-1"], "Master of the Rite");
  assertEquals(re?.notes, ["Founded 2026."]);
  await deleteSept(s.id);
});

Deno.test("septDb -- findSeptByPack / findSeptByCaern", OPTS, async () => {
  await cleanupSept("Lookup-Sept");
  const s = await createSept("Lookup-Sept");
  s.packIds.push("p-look");
  s.caernId = "c-look";
  await saveSept(s);
  const byPack = await findSeptByPack("p-look");
  assertEquals(byPack?.id, s.id);
  const byCaern = await findSeptByCaern("c-look");
  assertEquals(byCaern?.id, s.id);
  await deleteSept(s.id);
});

// -- Exec flows -------------------------------------------------------------

Deno.test("+sept/create -- staff", OPTS, async () => {
  await cleanupSept("New-Sept");
  const exec = getExec("+sept");
  await exec(mockU({
    me: mockPlayer({ id: "staff-sept-1", flags: new Set(["player", "connected", "admin"]) }),
    args: ["create", "New-Sept"],
  }));
  const s = await findSeptByName("New-Sept");
  assert(s);
  await deleteSept(s!.id);
});

Deno.test("+sept/bind -- staff binds caern", OPTS, async () => {
  await cleanupSept("Bind-Sept");
  const exec = getExec("+sept");
  const sept = await createSept("Bind-Sept");
  const caern = await createCaern("Bind-Caern-x", 3, "Wisdom");
  await exec(mockU({
    me: mockPlayer({ id: "staff-sept-2", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["bind", "Bind-Sept/Bind-Caern-x"],
  }));
  const re = await findSeptById(sept.id);
  assertEquals(re?.caernId, caern.id);
  await deleteSept(sept.id);
  await deleteCaern(caern.id);
});

Deno.test("+sept/join -- alpha brings pack into sept", OPTS, async () => {
  await cleanupSept("Join-Sept");
  const exec = getExec("+sept");
  const alpha = await makeChar("sept-join-alpha", "wta");
  const pack = await createPack("JoinPack", alpha.id);
  alpha.packId = pack.id; await saveChar(alpha);
  const sept = await createSept("Join-Sept");

  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["join", "Join-Sept"],
  }));
  const re = await findSeptById(sept.id);
  assert(re?.packIds.includes(pack.id));

  // /leave pulls back out.
  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["leave", ""],
  }));
  const after = await findSeptById(sept.id);
  assertEquals(after?.packIds, []);

  await deletePack(pack.id);
  await deleteSept(sept.id);
});

Deno.test("+sept/leader -- staff sets sept leader", OPTS, async () => {
  await cleanupSept("Leader-Sept");
  const exec = getExec("+sept");
  const leader = await makeChar("sept-leader-1", "wta");
  const leaderDB = mockPlayer({ id: leader.playerId, name: "Leader" });
  const sept = await createSept("Leader-Sept");

  await exec(mockU({
    me: mockPlayer({ id: "staff-l", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["alpha", "Leader-Sept=Leader"],
    targetResult: leaderDB,
  }));
  const re = await findSeptById(sept.id);
  assertEquals(re?.leader, leader.id);
  await deleteSept(sept.id);
});

Deno.test("+sept/position -- leader assigns; /unposition clears", OPTS, async () => {
  await cleanupSept("Pos-Sept");
  const exec = getExec("+sept");
  const leader = await makeChar("sept-pos-leader", "wta");
  const beta = await makeChar("sept-pos-beta", "wta");
  const betaDB = mockPlayer({ id: beta.playerId, name: "Beta" });
  const sept = await createSept("Pos-Sept");
  sept.leader = leader.id;
  await saveSept(sept);

  await exec(mockU({
    me: mockPlayer({ id: leader.playerId }),
    args: ["position", "Pos-Sept/Beta=Master of the Rite"],
    targetResult: betaDB,
  }));
  const re = await findSeptById(sept.id);
  assertEquals(re?.positions[beta.id], "Master of the Rite");

  await exec(mockU({
    me: mockPlayer({ id: leader.playerId }),
    args: ["unposition", "Pos-Sept/Beta"],
    targetResult: betaDB,
  }));
  const after = await findSeptById(sept.id);
  assertEquals(after?.positions[beta.id], undefined);

  await deleteSept(sept.id);
});

Deno.test("+sept/roster -- full render with caern + leader + packs", OPTS, async () => {
  await cleanupSept("Roster-Sept");
  const exec = getExec("+sept");
  const alpha = await makeChar("sept-rost-alpha", "wta");
  const beta = await makeChar("sept-rost-beta", "wta");
  alpha.fullName = "Storm-of-Voices";
  alpha.rank = 3; alpha.auspice = "galliard"; alpha.breed = "homid";
  beta.fullName = "Cassidy Cloudwalker";
  beta.rank = 2; beta.auspice = "philodox"; beta.breed = "homid";
  await saveChar(alpha); await saveChar(beta);

  const pack = await createPack("RosterPack-S", alpha.id);
  pack.members.push(beta.id);
  pack.totem = "Wolf";
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId = pack.id; await saveChar(beta);

  const caern = await createCaern("Roster-Caern", 4, "Honor");
  const sept = await createSept("Roster-Sept");
  sept.caernId = caern.id;
  sept.packIds = [pack.id];
  sept.leader = alpha.id;
  sept.positions = { [beta.id]: "Master of the Rite" };
  await saveSept(sept);

  const u = mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["roster", "Roster-Sept"],
  });
  await exec(u);
  const out = (u as unknown as { _sent: { msg: string }[] })._sent
    .map((s) => s.msg).join("\n");
  assert(/Roster-Sept/.test(out));
  assert(/Roster-Caern/.test(out), "caern name should appear in header");
  assert(/Storm-of-Voices/.test(out));
  assert(/Cassidy Cloudwalker/.test(out));
  assert(/Galliard/.test(out));
  assert(/Philodox/.test(out));
  assert(/3 Adren/.test(out));
  assert(/2 Fostern/.test(out));
  assert(/Master of the Rite/.test(out));
  assert(/Sept Alpha/.test(out), "Sept Alpha header should be present");

  await deletePack(pack.id);
  await deleteCaern(caern.id);
  await deleteSept(sept.id);
});

Deno.test("+sept/disband -- blocks when packs remain; clears when empty", OPTS, async () => {
  await cleanupSept("Disband-Sept");
  const exec = getExec("+sept");
  const sept = await createSept("Disband-Sept");
  sept.packIds = ["p-stuck"];
  await saveSept(sept);

  await exec(mockU({
    me: mockPlayer({ id: "staff-d", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["disband", "Disband-Sept"],
  }));
  const still = await findSeptById(sept.id);
  assert(still, "disband should be blocked while packs remain");

  // Clear packs + retry.
  still!.packIds = [];
  await saveSept(still!);
  await exec(mockU({
    me: mockPlayer({ id: "staff-d", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["disband", "Disband-Sept"],
  }));
  assertEquals(await findSeptById(sept.id), null);
});

Deno.test("findAllSepts sorts by createdAt", OPTS, async () => {
  const a = await createSept("Sort-A-Sept");
  const b = await createSept("Sort-B-Sept");
  const all = await findAllSepts();
  const ids = all.map((s) => s.id);
  assert(ids.includes(a.id));
  assert(ids.includes(b.id));
  await deleteSept(a.id);
  await deleteSept(b.id);
});
