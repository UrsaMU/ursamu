// tests/caern.test.ts -- Caern DBO + +caern command flows.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/caern.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { createPack, deletePack, findPackById, savePack } from "../db/packDb.ts";
import {
  createCaern,
  deleteCaern,
  findAllCaerns,
  findCaernById,
  findCaernByName,
  findCaernByRoom,
  saveCaern,
} from "../db/caernDb.ts";
import { caernBonus, caernIdForRoom } from "../core/caern.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function cleanupCaern(name: string): Promise<void> {
  const c = await findCaernByName(name);
  if (c) await deleteCaern(c.id);
}

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
  /** Optional db.get(id) result -- used by /setroom validation. */
  getResult?: Partial<IDBObj> | null;
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  const dbWrites: Array<{ id: string; op: string; payload: unknown }> = [];
  // Default db.get returns a real-looking room so /setroom passes the
  // room-flag check; tests that want a non-room override via opts.getResult.
  const defaultRoom: Partial<IDBObj> = {
    id: "mock-room-default",
    name: "Mock Room",
    flags: new Set(["room"]),
  };
  return Object.assign({
    me: opts.me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+caern", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string, to?: string) => sent.push({ msg: m, to }),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async (id: string, op: string, payload: unknown) => {
        dbWrites.push({ id, op, payload });
      },
      get: async (_id: string) =>
        opts.getResult === undefined ? defaultRoom : opts.getResult,
      search: async () => [],
      create: async () => ({}),
      destroy: async () => {},
    },
    util: {
      target: async () => opts.targetResult ?? null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, { _sent: sent, _dbWrites: dbWrites });
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

// -- DBO smoke tests --------------------------------------------------------

Deno.test("caernDb -- create / findById / findByName", OPTS, async () => {
  const c = await createCaern("Heart-of-Stone", 3, "Wisdom");
  assertEquals(c.level, 3);
  assertEquals(c.type, "Wisdom");
  assertEquals(c.packIds, []);

  const byId = await findCaernById(c.id);
  assertEquals(byId?.name, "Heart-of-Stone");

  const byName = await findCaernByName("heart-of-stone");
  assertEquals(byName?.id, c.id);

  await deleteCaern(c.id);
});

Deno.test("caernDb -- saveCaern persists packIds + guardians + room binding", OPTS, async () => {
  const c = await createCaern("Save-Caern", 2, "Honor");
  c.packIds.push("pack-x");
  c.guardians.push("char-w");
  c.locationRoomId = "room-1234";
  c.septName = "Sept of the Twin Pines";
  c.wardingDifficulty = 8;
  c.notes.push("Bound after the Storm War");
  await saveCaern(c);

  const reread = await findCaernById(c.id);
  assertEquals(reread?.packIds, ["pack-x"]);
  assertEquals(reread?.guardians, ["char-w"]);
  assertEquals(reread?.locationRoomId, "room-1234");
  assertEquals(reread?.septName, "Sept of the Twin Pines");
  assertEquals(reread?.wardingDifficulty, 8);
  assertEquals(reread?.notes, ["Bound after the Storm War"]);

  const byRoom = await findCaernByRoom("room-1234");
  assertEquals(byRoom?.id, c.id);

  await deleteCaern(c.id);
});

Deno.test("caernDb -- findAllCaerns sorts by createdAt", OPTS, async () => {
  const a = await createCaern("Sort-One", 1, "Glory");
  const b = await createCaern("Sort-Two", 1, "Glory");
  const all = await findAllCaerns();
  const ids = all.map((c) => c.id);
  assert(ids.includes(a.id));
  assert(ids.includes(b.id));
  await deleteCaern(a.id);
  await deleteCaern(b.id);
});

// -- core/caern bonus resolver ---------------------------------------------

Deno.test("caernBonus -- garou + caern by level", () => {
  const char = { splat: "wta" } as IWoDChar;
  const lv = (n: 1|2|3|4|5) => ({ level: n } as Parameters<typeof caernBonus>[1]);
  assertEquals(caernBonus(char, lv(1)).gnosisRate, 1.25);
  assertEquals(caernBonus(char, lv(2)).ritualDieBonus, 1);
  assertEquals(caernBonus(char, lv(3)).gnosisRate, 1.5);
  assertEquals(caernBonus(char, lv(5)).gnosisRate, 2.0);
});

Deno.test("caernBonus -- mortals / kinfolk / null returns empty", () => {
  const lv3 = { level: 3 } as Parameters<typeof caernBonus>[1];
  assertEquals(caernBonus({ splat: "mortal" } as IWoDChar, lv3), {});
  assertEquals(caernBonus({ splat: "kinfolk" } as IWoDChar, lv3), {});
  assertEquals(caernBonus(null, lv3), {});
  assertEquals(caernBonus({ splat: "wta" } as IWoDChar, null), {});
});

Deno.test("caernIdForRoom -- reads state.caernId", () => {
  assertEquals(caernIdForRoom({ state: { caernId: "abc" } }), "abc");
  assertEquals(caernIdForRoom({ state: {} }), undefined);
  assertEquals(caernIdForRoom(null), undefined);
});

// -- Exec flows -------------------------------------------------------------

Deno.test("+caern/create -- staff happy path", OPTS, async () => {
  await cleanupCaern("Wyld-Heart");
  const exec = getExec("+caern");
  const u = mockU({
    me: mockPlayer({ id: "staff-1", flags: new Set(["player", "connected", "admin"]) }),
    args: ["create", "Wyld-Heart=4=Rage"],
  });
  await exec(u);
  const got = await findCaernByName("Wyld-Heart");
  assert(got, "caern should be created");
  assertEquals(got!.level, 4);
  assertEquals(got!.type, "Rage");
  await deleteCaern(got!.id);
});

Deno.test("+caern/setroom -- staff binds room and marks state", OPTS, async () => {
  await cleanupCaern("Bound-Caern");
  const exec = getExec("+caern");
  const c = await createCaern("Bound-Caern", 2, "Wisdom");
  const u = mockU({
    me: mockPlayer({ id: "staff-2", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["setroom", "Bound-Caern=room-99"],
  });
  await exec(u);
  const reread = await findCaernById(c.id);
  assertEquals(reread?.locationRoomId, "room-99");
  const writes = (u as unknown as { _dbWrites: Array<{ id: string; op: string; payload: Record<string, unknown> }> })._dbWrites;
  const setOnRoom = writes.find((w) => w.id === "room-99" && w.op === "$set");
  assert(setOnRoom, "should mark room.state.caernId");
  await deleteCaern(c.id);
});

Deno.test("+caern/claim -- alpha claims for pack; lifecycle", OPTS, async () => {
  await cleanupCaern("Claim-Test");
  const exec = getExec("+caern");
  const alpha = await makeChar("caern-alpha-1", "wta");
  const pack = await createPack("ClaimPack", alpha.id);
  alpha.packId = pack.id;
  await saveChar(alpha);

  const caern = await createCaern("Claim-Test", 3, "Honor");

  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["claim", "Claim-Test"],
  }));

  const after = await findCaernById(caern.id);
  assertEquals(after?.packIds, [pack.id]);

  // Release.
  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["release", "Claim-Test"],
  }));
  const released = await findCaernById(caern.id);
  assertEquals(released?.packIds, []);

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("+caern/guardian -- alpha of claiming pack assigns guardian", OPTS, async () => {
  await cleanupCaern("Guard-Test");
  const exec = getExec("+caern");
  const alpha = await makeChar("caern-guard-alpha", "wta");
  const warder = await makeChar("caern-guard-warder", "wta");
  const pack = await createPack("GuardPack", alpha.id);
  pack.members.push(warder.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  warder.packId = pack.id; await saveChar(warder);

  const caern = await createCaern("Guard-Test", 2, "Wisdom");
  caern.packIds = [pack.id];
  await saveCaern(caern);

  const warderDBObj = mockPlayer({ id: warder.playerId, name: "Warder" });
  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["guardian", "Guard-Test=Warder"],
    targetResult: warderDBObj,
  }));

  const after = await findCaernById(caern.id);
  assertEquals(after?.guardians, [warder.id]);

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("saveChar / pack membership reach-through (no IWoDChar caern fields)", OPTS, async () => {
  // Caern membership is reachable via char.packId -> pack -> caern.packIds.
  // This documents the design: no new fields on IWoDChar are needed.
  const alpha = await makeChar("caern-reach-1", "wta");
  const pack = await createPack("ReachPack", alpha.id);
  alpha.packId = pack.id; await saveChar(alpha);

  const caern = await createCaern("Reach-Caern", 1, "Wisdom");
  caern.packIds = [pack.id]; await saveCaern(caern);

  const fresh = await findByPlayer(alpha.playerId);
  assertEquals(fresh?.packId, pack.id);
  const fpack = await findPackById(fresh!.packId!);
  assert(fpack);
  const found = (await findAllCaerns()).find((c) => c.packIds.includes(fpack!.id));
  assertEquals(found?.id, caern.id);

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

