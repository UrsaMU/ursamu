// tests/pack.test.ts -- Pack DBO + exec-level flows for +pack.
//
// Tests run against the real DBO/KV (URSAMU_DB env-isolated). They verify:
//   - DBO CRUD via db/packDb helpers
//   - splat gating (kinfolk/mortal cannot create or join)
//   - invite + accept round trip writes packId on invitee
//   - alpha leaves -> oldest member promotes
//   - last member leaves -> pack auto-disbands
//   - saveChar persistence of packId / packInvites (the known bite)

import { assert, assertEquals } from "@std/assert";
import { cmds } from "@ursamu/ursamu";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";
import "../commands/pack.ts";

import { createChar, findById, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import {
  createPack,
  findAllPacks,
  findPackById,
  findPackByName,
  savePack,
  deletePack,
  type IPack,
} from "../db/packDb.ts";
import type { IWoDChar, SplatId } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

/** Wipe a named pack if it lingers from a prior failed run. */
async function cleanupPack(name: string): Promise<void> {
  const p = await findPackByName(name);
  if (p) await deletePack(p.id);
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
}

function mockU(opts: MockOpts) {
  const sent: Array<{ msg: string; to?: string }> = [];
  return Object.assign({
    me: opts.me,
    here: { id: "room-1", name: "Room", flags: new Set(["room"]), state: {}, location: "", contents: [] },
    cmd: { name: "+pack", original: "", args: opts.args ?? [], switches: [] },
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

async function makeWtaChar(playerId: string): Promise<IWoDChar> {
  const c = await createChar(playerId, "wta");
  await setStatus(c.id, "approved");
  const fresh = await findByPlayer(playerId);
  return fresh!;
}

async function makeCharOfSplat(playerId: string, splat: SplatId): Promise<IWoDChar> {
  const c = await createChar(playerId, splat);
  await setStatus(c.id, "approved");
  const fresh = await findByPlayer(playerId);
  return fresh!;
}

// -- DBO smoke tests --------------------------------------------------------

Deno.test("packDb -- createPack / findPackById / findPackByName", OPTS, async () => {
  const p = await createPack("Test Pack Alpha-A", "char-1");
  assertEquals(p.members, ["char-1"]);
  assertEquals(p.alpha, "char-1");

  const byId = await findPackById(p.id);
  assertEquals(byId?.name, "Test Pack Alpha-A");

  const byName = await findPackByName("test pack alpha-a"); // case-insensitive
  assertEquals(byName?.id, p.id);

  await deletePack(p.id);
});

Deno.test("packDb -- savePack persists members + totem", OPTS, async () => {
  const p = await createPack("Save-Test", "char-x");
  p.members.push("char-y");
  p.totem = "Wolf";
  p.totemRating = 5;
  await savePack(p);

  const reread = await findPackById(p.id);
  assertEquals(reread?.members, ["char-x", "char-y"]);
  assertEquals(reread?.totem, "Wolf");
  assertEquals(reread?.totemRating, 5);

  await deletePack(p.id);
});

// -- Exec-level flows -------------------------------------------------------

Deno.test("+pack/create -- happy path, alpha gets packId", OPTS, async () => {
  await cleanupPack("Howlers");
  const exec = getExec("+pack");
  const char = await makeWtaChar("pack-actor-1");
  const u = mockU({
    me: mockPlayer({ id: "pack-actor-1" }),
    args: ["create", "Howlers"],
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /formed/i.test(s.msg)), JSON.stringify(sent));

  const updated = await findById(char.id);
  assert(updated?.packId, "packId not persisted on alpha");
  const pack = await findPackByName("Howlers");
  assertEquals(pack?.alpha, char.id);
  assertEquals(pack?.members, [char.id]);

  // cleanup
  if (pack) await deletePack(pack.id);
});

Deno.test("+pack/create -- mortal blocked", OPTS, async () => {
  const exec = getExec("+pack");
  await makeCharOfSplat("pack-mortal-1", "mortal");
  const u = mockU({
    me: mockPlayer({ id: "pack-mortal-1" }),
    args: ["create", "Mortals"],
  });
  await exec(u);
  const sent = (u as unknown as { _sent: { msg: string }[] })._sent;
  assert(sent.some((s) => /Garou.*WtA/i.test(s.msg)), JSON.stringify(sent));
  assertEquals(await findPackByName("Mortals"), null);
});

Deno.test("+pack/create -- kinfolk blocked", OPTS, async () => {
  const exec = getExec("+pack");
  await makeCharOfSplat("pack-kin-1", "kinfolk");
  const u = mockU({
    me: mockPlayer({ id: "pack-kin-1" }),
    args: ["create", "Kinpack"],
  });
  await exec(u);
  assertEquals(await findPackByName("Kinpack"), null);
});

Deno.test("+pack/invite + /accept -- invitee joins, packId persisted via saveChar", OPTS, async () => {
  await cleanupPack("Invite-Test");
  const exec = getExec("+pack");
  const alpha = await makeWtaChar("pack-inv-alpha");
  const invitee = await makeWtaChar("pack-inv-invitee");

  // Alpha creates pack.
  await exec(mockU({ me: mockPlayer({ id: alpha.playerId }), args: ["create", "Invite-Test"] }));
  const pack = await findPackByName("Invite-Test");
  assert(pack, "pack should exist after create");

  // Alpha invites.
  const inviteeDBObj = mockPlayer({ id: invitee.playerId, name: "Invitee" });
  const inviteU = mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["invite", "Invitee"],
    targetResult: inviteeDBObj,
  });
  await exec(inviteU);
  const inviteSent = (inviteU as unknown as { _sent: { msg: string }[] })._sent;
  const afterInvite = await findById(invitee.id);
  assertEquals(afterInvite?.packInvites, [pack!.id],
    `packInvites not persisted on invitee. sent=${JSON.stringify(inviteSent)}`);

  // Invitee accepts.
  await exec(mockU({ me: inviteeDBObj, args: ["accept", ""] }));
  const afterAccept = await findById(invitee.id);
  assertEquals(afterAccept?.packId, pack!.id, "packId not persisted on invitee after accept");
  assertEquals(afterAccept?.packInvites, undefined);

  const reread = await findPackById(pack!.id);
  assertEquals(reread?.members.length, 2);
  assertEquals(reread?.members[1], invitee.id);

  // cleanup
  await deletePack(pack!.id);
});

Deno.test("+pack/leave -- alpha leaves, oldest other member promotes", OPTS, async () => {
  await cleanupPack("Leave-Test");
  const exec = getExec("+pack");
  const alpha = await makeWtaChar("pack-leave-alpha");
  const beta  = await makeWtaChar("pack-leave-beta");

  const pack = await createPack("Leave-Test", alpha.id);
  pack.members.push(beta.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId  = pack.id; await saveChar(beta);

  await exec(mockU({ me: mockPlayer({ id: alpha.playerId }), args: ["leave", ""] }));

  const afterPack = await findPackById(pack.id);
  assertEquals(afterPack?.alpha, beta.id, "beta should be promoted");
  assertEquals(afterPack?.members, [beta.id]);
  const alphaAfter = await findById(alpha.id);
  assertEquals(alphaAfter?.packId, undefined);

  await deletePack(pack.id);
});

Deno.test("+pack/leave -- last member triggers auto-disband", OPTS, async () => {
  await cleanupPack("Solo-Test");
  const exec = getExec("+pack");
  const solo = await makeWtaChar("pack-solo-1");
  const pack = await createPack("Solo-Test", solo.id);
  solo.packId = pack.id; await saveChar(solo);

  await exec(mockU({ me: mockPlayer({ id: solo.playerId }), args: ["leave", ""] }));
  assertEquals(await findPackById(pack.id), null, "pack should be auto-disbanded");
  const after = await findById(solo.id);
  assertEquals(after?.packId, undefined);
});

Deno.test("+pack/disband -- non-alpha non-staff is rejected", OPTS, async () => {
  await cleanupPack("Disband-Test");
  const exec = getExec("+pack");
  const alpha = await makeWtaChar("pack-dis-alpha");
  const beta  = await makeWtaChar("pack-dis-beta");
  const pack = await createPack("Disband-Test", alpha.id);
  pack.members.push(beta.id);
  await savePack(pack);
  alpha.packId = pack.id; await saveChar(alpha);
  beta.packId  = pack.id; await saveChar(beta);

  await exec(mockU({ me: mockPlayer({ id: beta.playerId }), args: ["disband", ""] }));
  // Pack still exists -- beta is not alpha and not staff.
  const stillThere = await findPackById(pack.id);
  assert(stillThere, "non-alpha should not be able to disband");

  // Cleanup.
  await deletePack(pack.id);
});

Deno.test("+pack/totem -- non-staff is rejected", OPTS, async () => {
  await cleanupPack("TotemTest");
  const exec = getExec("+pack");
  const me = await makeWtaChar("pack-totem-1");
  const pack = await createPack("TotemTest", me.id);
  me.packId = pack.id; await saveChar(me);

  await exec(mockU({
    me: mockPlayer({ id: me.playerId }), // no admin/wizard flag
    args: ["totem", "TotemTest/Stag=4"],
  }));
  const reread = await findPackById(pack.id);
  assertEquals(reread?.totem, "");

  await deletePack(pack.id);
});

Deno.test("+pack/totem -- staff sets totem", OPTS, async () => {
  await cleanupPack("TotemStaff");
  const exec = getExec("+pack");
  const me = await makeWtaChar("pack-totem-staff");
  const pack = await createPack("TotemStaff", me.id);
  me.packId = pack.id; await saveChar(me);

  await exec(mockU({
    me: mockPlayer({ id: me.playerId, flags: new Set(["player", "connected", "admin"]) }),
    args: ["totem", "TotemStaff/Stag=4"],
  }));
  const reread = await findPackById(pack.id);
  assertEquals(reread?.totem, "Stag");
  assertEquals(reread?.totemRating, 4);

  await deletePack(pack.id);
});

Deno.test("+pack/totem -- strips MUSH color codes from custom totem names (L-1)", OPTS, async () => {
  // Staff-supplied custom totem names must not embed render-time formatting
  // codes (%cr, %cn, %ch, ...) into the pack record. Defense-in-depth: must
  // hold even if the SDK's stripSubs stops stripping codes (build a mock
  // that intentionally leaves %c codes intact to simulate that regression).
  await cleanupPack("L1-Strip");
  const exec = getExec("+pack");
  const me = await makeWtaChar("pack-totem-l1");
  const pack = await createPack("L1-Strip", me.id);
  me.packId = pack.id; await saveChar(me);

  // Build a mock u where stripSubs is the identity (regression simulation).
  const noStripU = mockU({
    me: mockPlayer({ id: me.playerId, flags: new Set(["player", "connected", "admin"]) }),
    args: ["totem", "L1-Strip/%crBadSpirit%cn=3"],
  });
  // deno-lint-ignore no-explicit-any
  (noStripU as any).util.stripSubs = (s: string) => s;
  await exec(noStripU);
  const reread = await findPackById(pack.id);
  assert(reread, "pack should exist");
  assert(!/%c[a-z]/i.test(reread!.totem),
    `totem must not contain MUSH color codes; got ${JSON.stringify(reread!.totem)}`);
  assert(reread!.totem.includes("BadSpirit"), "literal name preserved minus the codes");

  await deletePack(pack.id);
});

Deno.test("+pack/totem -- preserves pre-existing curated boons when switching to a canonical spirit", OPTS, async () => {
  // Audit M-1: a staff-curated totemBoons list must NOT be silently overwritten
  // when staff binds a canonical spirit (which carries its own def.totemBoons).
  await cleanupPack("BoonsKeep");
  const exec = getExec("+pack");
  const me = await makeWtaChar("pack-totem-boonskeep");
  const pack = await createPack("BoonsKeep", me.id);
  pack.totemBoons = ["Custom boon: glory on the hunt"];
  await savePack(pack);
  me.packId = pack.id; await saveChar(me);

  // "wolf" is in WTA_SPIRITS with its own totemBoons.
  await exec(mockU({
    me: mockPlayer({ id: me.playerId, flags: new Set(["player", "connected", "admin"]) }),
    args: ["totem", "BoonsKeep/wolf=5"],
  }));
  const reread = await findPackById(pack.id);
  assertEquals(reread?.totem, "Wolf", "canonical name should win");
  assert(
    (reread?.totemBoons ?? []).includes("Custom boon: glory on the hunt"),
    `curated boon must survive overwrite; got ${JSON.stringify(reread?.totemBoons)}`,
  );

  await deletePack(pack.id);
});

Deno.test("saveChar persists packId / packInvites (regression: allowlist bite)", OPTS, async () => {
  const c = await makeWtaChar("pack-persist-1");
  c.packId = "fake-pack-id";
  c.packInvites = ["fake-pack-a", "fake-pack-b"];
  await saveChar(c);

  const re = await findById(c.id);
  assertEquals(re?.packId, "fake-pack-id");
  assertEquals(re?.packInvites, ["fake-pack-a", "fake-pack-b"]);
});

Deno.test("multiple invites -- /accept without arg lists them; with arg picks one; clears rest", OPTS, async () => {
  await cleanupPack("Multi-A");
  await cleanupPack("Multi-B");
  const exec = getExec("+pack");
  const alphaA = await makeWtaChar("multi-alpha-a");
  const alphaB = await makeWtaChar("multi-alpha-b");
  const invitee = await makeWtaChar("multi-invitee");

  // Create both packs.
  await exec(mockU({ me: mockPlayer({ id: alphaA.playerId }), args: ["create", "Multi-A"] }));
  await exec(mockU({ me: mockPlayer({ id: alphaB.playerId }), args: ["create", "Multi-B"] }));
  const packA = await findPackByName("Multi-A");
  const packB = await findPackByName("Multi-B");
  assert(packA && packB);

  const inviteeDBObj = mockPlayer({ id: invitee.playerId, name: "Invitee" });

  // Both alphas invite the same player.
  await exec(mockU({ me: mockPlayer({ id: alphaA.playerId }), args: ["invite", "Invitee"], targetResult: inviteeDBObj }));
  await exec(mockU({ me: mockPlayer({ id: alphaB.playerId }), args: ["invite", "Invitee"], targetResult: inviteeDBObj }));

  const queued = await findById(invitee.id);
  assertEquals(queued?.packInvites?.length, 2, "should have two pending invites");

  // /accept with no arg + multiple invites should reject and list options.
  const ambiguous = mockU({ me: inviteeDBObj, args: ["accept", ""] });
  await exec(ambiguous);
  const ambMsgs = (ambiguous as unknown as { _sent: { msg: string }[] })._sent;
  assert(ambMsgs.some((s) => /Multi-A/.test(s.msg) && /Multi-B/.test(s.msg)),
    `expected list of pack names, got: ${JSON.stringify(ambMsgs)}`);

  // Re-read -- nothing should have been consumed.
  const stillQueued = await findById(invitee.id);
  assertEquals(stillQueued?.packInvites?.length, 2);

  // /accept Multi-B -- joins B, clears A.
  await exec(mockU({ me: inviteeDBObj, args: ["accept", "Multi-B"] }));
  const joined = await findById(invitee.id);
  assertEquals(joined?.packId, packB!.id);
  assertEquals(joined?.packInvites, undefined, "remaining invites should be cleared");

  const reB = await findPackById(packB!.id);
  assert(reB?.members.includes(invitee.id));
  const reA = await findPackById(packA!.id);
  assert(!reA?.members.includes(invitee.id), "should not have joined Multi-A");

  await deletePack(packA!.id);
  await deletePack(packB!.id);
});

Deno.test("multiple invites -- /decline <pack> drops one; others remain", OPTS, async () => {
  await cleanupPack("Decline-A");
  await cleanupPack("Decline-B");
  const exec = getExec("+pack");
  const alphaA = await makeWtaChar("decline-alpha-a");
  const alphaB = await makeWtaChar("decline-alpha-b");
  const invitee = await makeWtaChar("decline-invitee");

  await exec(mockU({ me: mockPlayer({ id: alphaA.playerId }), args: ["create", "Decline-A"] }));
  await exec(mockU({ me: mockPlayer({ id: alphaB.playerId }), args: ["create", "Decline-B"] }));
  const packA = await findPackByName("Decline-A");
  const packB = await findPackByName("Decline-B");
  assert(packA && packB);

  const inviteeDBObj = mockPlayer({ id: invitee.playerId, name: "Invitee" });
  await exec(mockU({ me: mockPlayer({ id: alphaA.playerId }), args: ["invite", "Invitee"], targetResult: inviteeDBObj }));
  await exec(mockU({ me: mockPlayer({ id: alphaB.playerId }), args: ["invite", "Invitee"], targetResult: inviteeDBObj }));

  // Decline A specifically -- B should remain.
  await exec(mockU({ me: inviteeDBObj, args: ["decline", "Decline-A"] }));
  const after = await findById(invitee.id);
  assertEquals(after?.packInvites, [packB!.id]);

  await deletePack(packA!.id);
  await deletePack(packB!.id);
});

Deno.test("invite sends an @mail to the invitee", OPTS, async () => {
  await cleanupPack("Mail-Test");
  const exec = getExec("+pack");
  const alpha = await makeWtaChar("mail-alpha");
  const invitee = await makeWtaChar("mail-invitee");

  await exec(mockU({ me: mockPlayer({ id: alpha.playerId }), args: ["create", "Mail-Test"] }));
  const pack = await findPackByName("Mail-Test");
  assert(pack);

  const inviteeDBObj = mockPlayer({ id: invitee.playerId, name: "Invitee" });
  await exec(mockU({
    me: mockPlayer({ id: alpha.playerId }),
    args: ["invite", "Invitee"],
    targetResult: inviteeDBObj,
  }));

  // Mail collection is "mail". Query via raw DBO.
  const { DBO } = await import("@ursamu/ursamu");
  const mailDb = new DBO<{ id: string; from: string; to: string[]; subject: string; message: string; read: boolean; date: number }>("mail");
  const allMail = await mailDb.find({});
  const toInvitee = allMail.filter((m) => Array.isArray(m.to) && m.to.includes(`#${invitee.id}`));
  assert(toInvitee.length >= 1, `expected mail to #${invitee.id}, got ${JSON.stringify(allMail)}`);
  const m = toInvitee[toInvitee.length - 1];
  assert(/Mail-Test/.test(m.subject), `subject should mention pack: ${m.subject}`);
  assert(/accept Mail-Test/i.test(m.message), `body should hint at /accept: ${m.message}`);

  // Cleanup mail we just sent.
  for (const msg of toInvitee) if (msg.id) await mailDb.delete({ id: msg.id });
  await deletePack(pack!.id);
});

Deno.test("findAllPacks returns created packs sorted", OPTS, async () => {
  const a = await createPack("Sort-A", "x1");
  const b = await createPack("Sort-B", "x2");
  const all = await findAllPacks();
  const ids = all.map((p: IPack) => p.id);
  assert(ids.includes(a.id));
  assert(ids.includes(b.id));
  await deletePack(a.id);
  await deletePack(b.id);
});
