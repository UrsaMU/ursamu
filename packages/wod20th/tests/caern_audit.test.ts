// tests/caern_audit.test.ts -- Adversarial / permission audit for +caern.
//
// Stage 4b (tdd-audit): every gate must reject. These tests assert what
// MUST NOT happen -- non-alpha cannot claim, non-staff cannot create or
// disband, releasing an unowned caern is a no-op, double-claim is a
// no-op, and /disband blocks while packs still hold the claim.

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/caern.ts";

import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import { createPack, deletePack, savePack } from "../db/packDb.ts";
import {
  createCaern,
  deleteCaern,
  findCaernById,
  findCaernByName,
} from "../db/caernDb.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

async function cleanupCaern(name: string): Promise<void> {
  const c = await findCaernByName(name);
  if (c) await deleteCaern(c.id);
}

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
  /** Optional db.get(id) result for /setroom validation tests. */
  getResult?: Partial<IDBObj> | null;
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  const dbWrites: Array<{ id: string; op: string }> = [];
  return Object.assign({
    me: opts.me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+caern", original: "", args: opts.args ?? [], switches: [] },
    send: (m: string, to?: string) => sent.push({ msg: m, to }),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      modify: async (id: string, op: string) => { dbWrites.push({ id, op }); },
      get: async (_id: string) => opts.getResult === undefined ? null : opts.getResult,
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

// -- Permission gates -------------------------------------------------------

Deno.test("AUDIT: +caern/create -- non-staff rejected", OPTS, async () => {
  const exec = getExec("+caern");
  const u = mockU({
    me: mockPlayer({ id: "aud-nonstaff", flags: new Set(["player", "connected"]) }),
    args: ["create", "Forbidden=3=Wisdom"],
  });
  await exec(u);
  assertEquals(await findCaernByName("Forbidden"), null);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /Permission denied/i.test(s.msg)), JSON.stringify(sent));
});

Deno.test("AUDIT: +caern/disband -- non-staff rejected", OPTS, async () => {
  await cleanupCaern("DisbandAudit");
  const exec = getExec("+caern");
  const c = await createCaern("DisbandAudit", 1, "Wisdom");
  await exec(mockU({
    me: mockPlayer({ id: "aud-nonstaff2", flags: new Set(["player", "connected"]) }),
    args: ["disband", "DisbandAudit"],
  }));
  assert(await findCaernById(c.id), "caern must still exist");
  await deleteCaern(c.id);
});

Deno.test("AUDIT: +caern/setroom -- non-staff rejected", OPTS, async () => {
  await cleanupCaern("SetroomAudit");
  const exec = getExec("+caern");
  const c = await createCaern("SetroomAudit", 1, "Wisdom");
  await exec(mockU({
    me: mockPlayer({ id: "aud-nonstaff3", flags: new Set(["player", "connected"]) }),
    args: ["setroom", "SetroomAudit=room-9"],
  }));
  const reread = await findCaernById(c.id);
  assertEquals(reread?.locationRoomId, undefined);
  await deleteCaern(c.id);
});

Deno.test("AUDIT: +caern/claim -- non-alpha rejected", OPTS, async () => {
  await cleanupCaern("ClaimAudit");
  const exec = getExec("+caern");
  const alpha = await makeChar("aud-alpha-1", "wta");
  const beta  = await makeChar("aud-beta-1", "wta");
  const pack = await createPack("ClaimAuditPack", alpha.id);
  pack.members.push(beta.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId  = pack.id; await saveChar(beta);

  const caern = await createCaern("ClaimAudit", 2, "Honor");

  // Beta (non-alpha) tries to claim.
  await exec(mockU({
    me: mockPlayer({ id: beta.playerId }),
    args: ["claim", "ClaimAudit"],
  }));
  const reread = await findCaernById(caern.id);
  assertEquals(reread?.packIds, [], "non-alpha must not claim");

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/claim -- non-wta rejected", OPTS, async () => {
  await cleanupCaern("SplatAudit");
  const exec = getExec("+caern");
  await makeChar("aud-mortal-1", "mortal");
  const caern = await createCaern("SplatAudit", 1, "Wisdom");

  await exec(mockU({
    me: mockPlayer({ id: "aud-mortal-1" }),
    args: ["claim", "SplatAudit"],
  }));
  const reread = await findCaernById(caern.id);
  assertEquals(reread?.packIds, []);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/release -- pack does not own caern -> no-op", OPTS, async () => {
  await cleanupCaern("ReleaseAudit");
  const exec = getExec("+caern");
  const alpha = await makeChar("aud-rel-alpha", "wta");
  const pack = await createPack("RelPack", alpha.id);
  alpha.packId = pack.id; await saveChar(alpha);
  const caern = await createCaern("ReleaseAudit", 1, "Wisdom");
  // Caern has no pack claim. Releasing should warn, not mutate.

  const u = mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["release", "ReleaseAudit"],
  });
  await exec(u);
  const reread = await findCaernById(caern.id);
  assertEquals(reread?.packIds, []);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /does not hold/i.test(s.msg)), JSON.stringify(sent));

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/claim -- double claim is a no-op", OPTS, async () => {
  await cleanupCaern("DoubleAudit");
  const exec = getExec("+caern");
  const alpha = await makeChar("aud-dbl-alpha", "wta");
  const pack = await createPack("DblPack", alpha.id);
  alpha.packId = pack.id; await saveChar(alpha);
  const caern = await createCaern("DoubleAudit", 1, "Wisdom");

  await exec(mockU({ me: mockPlayer({ id: alpha.playerId }), args: ["claim", "DoubleAudit"] }));
  await exec(mockU({ me: mockPlayer({ id: alpha.playerId }), args: ["claim", "DoubleAudit"] }));

  const reread = await findCaernById(caern.id);
  assertEquals(reread?.packIds, [pack.id], "should not duplicate the packId");

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/disband -- blocked when packs still claim", OPTS, async () => {
  await cleanupCaern("BlockedDisband");
  const exec = getExec("+caern");
  const alpha = await makeChar("aud-bd-alpha", "wta");
  const pack = await createPack("BDPack", alpha.id);
  alpha.packId = pack.id; await saveChar(alpha);
  const caern = await createCaern("BlockedDisband", 2, "Glory");
  caern.packIds = [pack.id];
  const { saveCaern } = await import("../db/caernDb.ts");
  await saveCaern(caern);

  const u = mockU({
    me: mockPlayer({ id: "aud-bd-staff", flags: new Set(["player", "connected", "admin"]) }),
    args: ["disband", "BlockedDisband"],
  });
  await exec(u);
  const still = await findCaernById(caern.id);
  assert(still, "caern must still exist while packs claim it");
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /still has.*pack/i.test(s.msg)), JSON.stringify(sent));

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/guardian -- non-alpha non-staff rejected", OPTS, async () => {
  await cleanupCaern("GuardAudit");
  const exec = getExec("+caern");
  const alpha = await makeChar("aud-guard-alpha", "wta");
  const beta  = await makeChar("aud-guard-beta", "wta");
  const pack = await createPack("GAudPack", alpha.id);
  pack.members.push(beta.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId  = pack.id; await saveChar(beta);

  const caern = await createCaern("GuardAudit", 1, "Wisdom");
  caern.packIds = [pack.id];
  const { saveCaern } = await import("../db/caernDb.ts");
  await saveCaern(caern);

  const betaDBObj = mockPlayer({ id: beta.playerId, name: "Beta" });
  await exec(mockU({
    me: mockPlayer({ id: beta.playerId }), // beta, not alpha
    args: ["guardian", "GuardAudit=Beta"],
    targetResult: betaDBObj,
  }));
  const reread = await findCaernById(caern.id);
  assertEquals(reread?.guardians, [], "non-alpha must not name guardians");

  await deletePack(pack.id);
  await deleteCaern(caern.id);
});

Deno.test("AUDIT: +caern/setroom -- rejects non-room target (I-2)", OPTS, async () => {
  await cleanupCaern("Setroom-Validate");
  const exec = getExec("+caern");
  const c = await createCaern("Setroom-Validate", 2, "Wisdom");

  // db.get returns an object that is a player (not a room): must reject.
  const u = mockU({
    me: mockPlayer({ id: "staff-i2", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["setroom", "Setroom-Validate=p-imposter"],
    getResult: { id: "p-imposter", name: "Imposter", flags: new Set(["player"]) },
  });
  await exec(u);
  const reread = await findCaernById(c.id);
  assertEquals(reread?.locationRoomId, undefined, "must not bind to a non-room");
  const writes = (u as unknown as { _dbWrites: Array<{ id: string; op: string }> })._dbWrites;
  assert(!writes.some((w) => w.id === "p-imposter"),
    "must not write state.caernId onto a non-room target");
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /not a room|is not a room/i.test(s.msg)),
    `expected rejection message; got: ${JSON.stringify(sent)}`);

  await deleteCaern(c.id);
});

Deno.test("AUDIT: +caern/setroom -- rejects when target id resolves to null (I-2)", OPTS, async () => {
  await cleanupCaern("Setroom-Missing");
  const exec = getExec("+caern");
  const c = await createCaern("Setroom-Missing", 2, "Wisdom");

  const u = mockU({
    me: mockPlayer({ id: "staff-i2b", flags: new Set(["player", "connected", "wizard"]) }),
    args: ["setroom", "Setroom-Missing=does-not-exist"],
    getResult: null,
  });
  await exec(u);
  const reread = await findCaernById(c.id);
  assertEquals(reread?.locationRoomId, undefined, "must not bind to a missing target");

  await deleteCaern(c.id);
});

// I-1: caernBonus must be CONSUMED by regen and rite paths. Source-text
// guards: commands/pool.ts and commands/rite.ts must import + call the
// helper. Without wiring, the bonus is dead.
Deno.test("AUDIT: caernBonus is wired into +gnosis/regain (I-1)", OPTS, async () => {
  const POOL_SRC = await Deno.readTextFile(
    new URL("../commands/pool.ts", import.meta.url),
  );
  assert(/import .*caernBonus/.test(POOL_SRC) ||
         /from "\.\.\/core\/caern\.ts"/.test(POOL_SRC),
    "+gnosis/regain must import from core/caern.ts");
  assert(/caernBonus\(/.test(POOL_SRC),
    "+gnosis/regain must call caernBonus()");
  // Regain branch should apply gnosisRate to amount.
  assert(/gnosisRate/.test(POOL_SRC),
    "regain handler must reference gnosisRate from caernBonus");
});

Deno.test("AUDIT: caernBonus is wired into +rite/cast (I-1)", OPTS, async () => {
  const RITE_SRC = await Deno.readTextFile(
    new URL("../commands/rite.ts", import.meta.url),
  );
  assert(/import .*caernBonus/.test(RITE_SRC) ||
         /from "\.\.\/core\/caern\.ts"/.test(RITE_SRC),
    "+rite/cast must import from core/caern.ts");
  assert(/caernBonus\(/.test(RITE_SRC),
    "+rite/cast must call caernBonus()");
  assert(/ritualDieBonus/.test(RITE_SRC),
    "+rite/cast must reference ritualDieBonus from caernBonus");
});
