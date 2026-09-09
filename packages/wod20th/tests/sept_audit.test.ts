// tests/sept_audit.test.ts -- Adversarial / permission audit for +sept.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/sept.ts";
import "../commands/pack.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { createPack, deletePack, savePack } from "../db/packDb.ts";
import {
  createSept,
  deleteSept,
  findSeptById,
  findSeptByName,
  saveSept,
} from "../db/septDb.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mockPlayer(overrides: Partial<IDBObj> = {}): IDBObj {
  return {
    id: "p-aud",
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

// -- Permission gates -------------------------------------------------------

Deno.test("AUDIT: +sept/create -- non-staff rejected", OPTS, async () => {
  const exec = getExec("+sept");
  await exec(mockU({
    me: mockPlayer({ id: "aud-ns-1", flags: new Set(["player", "connected"]) }),
    args: ["create", "AuditSept"],
  }));
  assertEquals(await findSeptByName("AuditSept"), null);
});

Deno.test("AUDIT: +sept/bind -- non-staff rejected", OPTS, async () => {
  await cleanupSept("Bind-Aud");
  const exec = getExec("+sept");
  const s = await createSept("Bind-Aud");
  await exec(mockU({
    me: mockPlayer({ id: "aud-ns-2", flags: new Set(["player", "connected"]) }),
    args: ["bind", "Bind-Aud/anything"],
  }));
  const re = await findSeptById(s.id);
  assertEquals(re?.caernId, undefined);
  await deleteSept(s.id);
});

Deno.test("AUDIT: +sept/leader -- non-staff rejected", OPTS, async () => {
  await cleanupSept("Leader-Aud");
  const exec = getExec("+sept");
  const s = await createSept("Leader-Aud");
  await exec(mockU({
    me: mockPlayer({ id: "aud-ns-3", flags: new Set(["player", "connected"]) }),
    args: ["leader", "Leader-Aud=anyone"],
  }));
  const re = await findSeptById(s.id);
  assertEquals(re?.leader, undefined);
  await deleteSept(s.id);
});

Deno.test("AUDIT: +sept/position -- non-leader / non-staff rejected", OPTS, async () => {
  await cleanupSept("Pos-Aud");
  const exec = getExec("+sept");
  const leader = await makeChar("aud-pos-leader", "wta");
  const random = await makeChar("aud-pos-random", "wta");
  const randomDB = mockPlayer({ id: random.playerId, name: "Random" });
  const sept = await createSept("Pos-Aud");
  sept.leader = leader.id;
  await saveSept(sept);

  await exec(mockU({
    me: mockPlayer({ id: random.playerId }), // not leader, not staff
    args: ["position", "Pos-Aud/Random=Sneak"],
    targetResult: randomDB,
  }));
  const re = await findSeptById(sept.id);
  assertEquals(re?.positions[random.id], undefined,
    "non-leader must not be able to set positions");
  await deleteSept(sept.id);
});

Deno.test("AUDIT: +sept/join -- non-alpha rejected", OPTS, async () => {
  await cleanupSept("Join-Aud");
  const exec = getExec("+sept");
  const alpha = await makeChar("aud-join-alpha", "wta");
  const beta = await makeChar("aud-join-beta", "wta");
  const pack = await createPack("JoinAudPack", alpha.id);
  pack.members.push(beta.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId  = pack.id; await saveChar(beta);

  const sept = await createSept("Join-Aud");
  await exec(mockU({
    me: mockPlayer({ id: beta.playerId }),
    args: ["join", "Join-Aud"],
  }));
  const re = await findSeptById(sept.id);
  assertEquals(re?.packIds, [], "non-alpha must not bring pack into a sept");

  await deletePack(pack.id);
  await deleteSept(sept.id);
});

Deno.test("AUDIT: +sept/disband -- blocked while packs remain", OPTS, async () => {
  await cleanupSept("Disband-Aud");
  const exec = getExec("+sept");
  const s = await createSept("Disband-Aud");
  s.packIds = ["p-stuck"];
  await saveSept(s);
  await exec(mockU({
    me: mockPlayer({ id: "aud-d", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["disband", "Disband-Aud"],
  }));
  assert(await findSeptById(s.id), "disband must be blocked while packs remain");
  await deleteSept(s.id);
});

Deno.test("AUDIT: +sept/bind -- caern already bound to another sept is rejected", OPTS, async () => {
  await cleanupSept("Rebind-A");
  await cleanupSept("Rebind-B");
  const exec = getExec("+sept");
  const { createCaern: mkc, deleteCaern: rmc } = await import("../db/caernDb.ts");
  const caern = await mkc("Shared-Caern", 2, "Honor");
  const a = await createSept("Rebind-A");
  a.caernId = caern.id; await saveSept(a);
  const b = await createSept("Rebind-B");

  await exec(mockU({
    me: mockPlayer({ id: "aud-rb", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["bind", "Rebind-B/Shared-Caern"],
  }));
  const re = await findSeptById(b.id);
  assertEquals(re?.caernId, undefined, "must not bind a caern already bound elsewhere");

  await deleteSept(a.id);
  await deleteSept(b.id);
  await rmc(caern.id);
});
