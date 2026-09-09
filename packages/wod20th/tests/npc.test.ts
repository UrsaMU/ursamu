// tests/npc.test.ts -- Wyrm NPC spawn/despawn + bestiary integrity
// + AI turn happy path + kill-counter wiring.

import { assert, assertEquals } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";

import {
  allNpcTemplates, getNpcTemplate, templatesByKind, WYRM_NPCS,
} from "../splats/wta/data/wyrmNpcs.ts";
import { spawnNpc, despawnNpc, runNpcTurn, recordNpcKill, npcsInRoom, pcsInRoom } from "../core/npc.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// deno-lint-ignore no-explicit-any
function makeRoom(id = "room-x"): any {
  return {
    id, name: "Combat Zone", flags: new Set(["room"]),
    state: {}, location: "", contents: [],
  };
}

function makeMockSDK(playerId: string) {
  const sent: string[] = [];
  // deno-lint-ignore no-explicit-any
  const created: any[] = [];
  const destroyed: string[] = [];
  const dbModified: Array<{ id: string; op: string; payload: unknown }> = [];
  const room = makeRoom();
  const me: IDBObj = {
    id: playerId, name: "Hero",
    flags: new Set(["player", "connected", "admin"]),
    state: {}, location: room.id, contents: [],
  };
  return Object.assign({
    me,
    here: room,
    cmd: { name: "+npc", original: "", args: [], switches: [] },
    send: (m: string) => sent.push(m),
    broadcast: () => {},
    canEdit: async () => true,
    db: {
      // deno-lint-ignore no-explicit-any
      modify: async (id: string, op: string, payload: unknown) => { dbModified.push({ id, op, payload }); },
      search: async () => [],
      // deno-lint-ignore no-explicit-any
      create: async (obj: any) => {
        created.push(obj);
        if (obj?.location === room.id) room.contents.push(obj);
        return obj;
      },
      destroy: async (id: string) => {
        destroyed.push(id);
        room.contents = room.contents.filter((c: IDBObj) => c.id !== id);
      },
    },
    util: {
      target: async () => null,
      displayName: (o: IDBObj) => o.name ?? "Unknown",
      stripSubs: (s: string) => s.replace(/%c[a-z]/gi, "").replace(/%[rntb]/gi, ""),
      center: (s: string) => s,
      ljust: (s: string, w: number) => s.padEnd(w),
      rjust: (s: string, w: number) => s.padStart(w),
    },
  } as unknown as IUrsamuSDK, {
    _sent: sent, _created: created, _destroyed: destroyed, _dbModified: dbModified,
    _room: room,
  });
}

// -- bestiary integrity ----------------------------------------------------

Deno.test("WYRM_NPCS: >=6 entries, unique slugs, threat 1-5, all required fields", OPTS, () => {
  const xs = allNpcTemplates();
  assert(xs.length >= 6, `expected >=6 templates, got ${xs.length}`);
  const slugs = new Set<string>();
  for (const t of xs) {
    assert(/^[a-z0-9][a-z0-9-]*$/.test(t.slug), `bad slug: ${t.slug}`);
    assert(!slugs.has(t.slug), `dup: ${t.slug}`);
    slugs.add(t.slug);
    assert(t.threat >= 1 && t.threat <= 5);
    assert(t.willpower >= 1);
    assert(t.rage >= 0);
    assert(t.description.length > 0);
    assert(["bane", "fomor", "bsd", "creature"].includes(t.kind));
  }
});

Deno.test("WYRM_NPCS: at least one of each kind", OPTS, () => {
  assert(templatesByKind("bane").length >= 1, "expected banes");
  assert(templatesByKind("fomor").length >= 1, "expected fomori");
  assert(templatesByKind("bsd").length >= 1, "expected BSDs");
  assert(templatesByKind("creature").length >= 1, "expected creatures");
});

Deno.test("getNpcTemplate: own-property guard", OPTS, () => {
  assertEquals(getNpcTemplate("toString"), undefined);
  assertEquals(getNpcTemplate("__proto__"), undefined);
  assertEquals(getNpcTemplate(""), undefined);
  const first = Object.keys(WYRM_NPCS)[0];
  assert(getNpcTemplate(first) !== undefined);
});

// -- spawn / despawn ------------------------------------------------------

Deno.test("spawnNpc: creates char (isNpc=true) and IDBObj in room", OPTS, async () => {
  const u = makeMockSDK("hero-1");
  const result = await spawnNpc(u, "bane-roach");
  assert(result);
  // deno-lint-ignore no-explicit-any
  const room = (u as any)._room;
  assertEquals(room.contents.length, 1);
  assertEquals(room.contents[0].id, result!.npcId);
  assert(room.contents[0].flags.has("npc"));

  const char = await findByPlayer(result!.npcId);
  assert(char);
  assertEquals(char!.isNpc, true);
  assertEquals(char!.npcTemplate, "bane-roach");
  assertEquals(char!.npcKind, "bane");
  assertEquals(char!.npcRoomId, room.id);
});

Deno.test("spawnNpc: unknown slug returns null and writes nothing", OPTS, async () => {
  const u = makeMockSDK("hero-2");
  const result = await spawnNpc(u, "not-a-template");
  assertEquals(result, null);
  // deno-lint-ignore no-explicit-any
  assertEquals((u as any)._room.contents.length, 0);
});

Deno.test("despawnNpc: removes IDBObj and marks char denied", OPTS, async () => {
  const u = makeMockSDK("hero-3");
  const r = await spawnNpc(u, "fomor-thug");
  assert(r);
  const ok = await despawnNpc(u, r!.npcId);
  assertEquals(ok, true);
  // deno-lint-ignore no-explicit-any
  assertEquals((u as any)._room.contents.length, 0);
  const refreshed = await findByPlayer(r!.npcId);
  assertEquals(refreshed?.status, "denied");
  assertEquals(refreshed?.npcRoomId, undefined);
});

Deno.test("despawnNpc: unknown id returns false", OPTS, async () => {
  const u = makeMockSDK("hero-4");
  const ok = await despawnNpc(u, "npc-nope");
  assertEquals(ok, false);
});

// -- room introspection helpers -------------------------------------------

Deno.test("npcsInRoom + pcsInRoom: filter contents by flags", OPTS, async () => {
  const u = makeMockSDK("hero-5");
  // deno-lint-ignore no-explicit-any
  const room = (u as any)._room;
  // Add a PC to the room.
  room.contents.push({
    id: "pc-1", name: "Packmate", flags: new Set(["player"]),
    state: {}, location: room.id, contents: [],
  });
  await spawnNpc(u, "bane-roach");

  assertEquals(npcsInRoom(room).length, 1);
  assertEquals(pcsInRoom(room).length, 1);
  assertEquals(pcsInRoom(room)[0].id, "pc-1");
});

// -- runNpcTurn happy + idle ----------------------------------------------

async function makePc(playerId: string): Promise<IWoDChar> {
  const c = await createChar(playerId, "wta");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(playerId))!;
  fresh.willpower = 5; fresh.willpowerCurrent = 5;
  fresh.rage = 3; fresh.rageCurrent = 3;
  fresh.gnosis = 3; fresh.gnosisCurrent = 3;
  fresh.attributes = { Strength: 2, Dexterity: 3, Stamina: 3 };
  fresh.abilities = { Brawl: 2, Dodge: 2 };
  fresh.healthTrack = [];
  await saveChar(fresh);
  return (await findByPlayer(playerId))!;
}

Deno.test("runNpcTurn: no PCs in room -> idle pose, no engagement", OPTS, async () => {
  const u = makeMockSDK("hero-6");
  const r = await spawnNpc(u, "bane-roach");
  const npc = (await findByPlayer(r!.npcId))!;
  const result = await runNpcTurn(u, npc);
  assertEquals(result.engaged, 0);
  assert(/prowls|no quarry|broken/i.test(result.pose));
});

Deno.test("runNpcTurn: incapacitated NPC -> no engagement", OPTS, async () => {
  const u = makeMockSDK("hero-7");
  const r = await spawnNpc(u, "bane-roach");
  const npc = (await findByPlayer(r!.npcId))!;
  // Fill incap with B damage so isIncapacitated is true.
  npc.healthTrack = ["B", "B", "B", "B", "B", "B", "B"];
  await saveChar(npc);
  const result = await runNpcTurn(u, npc);
  assertEquals(result.engaged, 0);
});

Deno.test("runNpcTurn: non-NPC char -> rejected", OPTS, async () => {
  const u = makeMockSDK("hero-8");
  const pc = await makePc("pc-not-npc");
  const result = await runNpcTurn(u, pc);
  assertEquals(result.engaged, 0);
  assert(/not an NPC/i.test(result.pose));
});

// -- recordNpcKill ---------------------------------------------------------

Deno.test("recordNpcKill: increments by kind, persists, no auto-renown", OPTS, async () => {
  await makePc("killer-1");
  const killer = (await findByPlayer("killer-1"))!;
  const renownBefore = killer.renown;
  const r1 = await recordNpcKill(killer, "bane");
  const r2 = await recordNpcKill(killer, "bane");
  await recordNpcKill(killer, "fomor");
  const fresh = (await findByPlayer("killer-1"))!;
  assertEquals(fresh.npcKills?.bane, 2);
  assertEquals(fresh.npcKills?.fomor, 1);
  // No renown change from the kill itself (titles, not kills, grant renown).
  assertEquals(JSON.stringify(fresh.renown), JSON.stringify(renownBefore));
  // Each kill awards a small XP trickle (0.20 by default).
  assertEquals(r1.xpAwarded > 0, true);
  assertEquals(r2.xpAwarded, r1.xpAwarded);
  // 3 kills * 0.20 = 0.60 accumulated XP.
  assertEquals(Number(fresh.xpTotal.toFixed(2)), 0.60);
});
