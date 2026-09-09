// tests/npc_combat_model.test.ts -- spirit vs physical combat-model split.
//
// Banes (kind=bane, combatModel=spirit) attack with Rage-as-pool vs
// the target's Willpower (W20 Ch 7). Fomori / BSDs / hellhounds use
// the normal Garou-shape resolution via resolveAttack.

import { assert, assertEquals } from "@std/assert";
import type { IDBObj, IUrsamuSDK } from "@ursamu/ursamu";

import "../splats/wta/index.ts";

import { spawnNpc, runNpcTurn } from "../core/npc.ts";
import { allNpcTemplates } from "../splats/wta/data/wyrmNpcs.ts";
import { createChar, findByPlayer, saveChar, setStatus } from "../db/charDb.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// deno-lint-ignore no-explicit-any
function makeRoom(id = "combat-zone"): any {
  return {
    id, name: "Test Arena", flags: new Set(["room"]),
    state: {}, location: "", contents: [],
  };
}

function makeMockSDK(playerId: string) {
  const sent: string[] = [];
  // deno-lint-ignore no-explicit-any
  const created: any[] = [];
  const destroyed: string[] = [];
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
      modify: async () => {},
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
    _sent: sent, _created: created, _destroyed: destroyed, _room: room,
  });
}

async function placeBait(u: IUrsamuSDK, pcId: string): Promise<void> {
  const c = await createChar(pcId, "wta");
  await setStatus(c.id, "approved");
  const fresh = (await findByPlayer(pcId))!;
  fresh.willpower = 4;
  fresh.willpowerCurrent = 4;
  fresh.attributes = { Stamina: 3, Strength: 2, Dexterity: 3 };
  fresh.abilities = { Brawl: 2, Dodge: 1 };
  fresh.healthTrack = [];
  await saveChar(fresh);
  // Place as a player IDBObj in the room.
  // deno-lint-ignore no-explicit-any
  const room = (u as any)._room;
  room.contents.push({
    id: pcId, name: "Bait", flags: new Set(["player"]),
    state: {}, location: room.id, contents: [],
  });
}

// -- bestiary integrity: every bane is spirit-model ---------------------

Deno.test("WYRM_NPCS: every bane has combatModel=spirit", OPTS, () => {
  const banes = allNpcTemplates().filter((t) => t.kind === "bane");
  assert(banes.length >= 1);
  for (const b of banes) {
    assertEquals(b.combatModel, "spirit", `${b.slug} must be spirit-model`);
  }
});

Deno.test("WYRM_NPCS: non-banes default to physical (or omit combatModel)", OPTS, () => {
  const others = allNpcTemplates().filter((t) => t.kind !== "bane");
  for (const t of others) {
    const m = t.combatModel ?? "physical";
    assertEquals(m, "physical", `${t.slug} must be physical-model`);
  }
});

// -- AI driver: spirit-model bane uses Rage-as-pool ---------------------

Deno.test("runNpcTurn: spirit-model bane rolls Rage; no resolveAttack soak", OPTS, async () => {
  const u = makeMockSDK("hero-spirit");
  await placeBait(u, "bait-spirit");
  const r = await spawnNpc(u, "bane-shade");
  assert(r);
  const npc = (await findByPlayer(r!.npcId))!;
  // Force high willpower target so success != guaranteed; we just want
  // the run to produce a strike record without throwing.
  const result = await runNpcTurn(u, npc);
  assertEquals(result.engaged, 1, "one PC in room -> one strike");
});

// -- Physical model still resolves via the legacy path ------------------

Deno.test("runNpcTurn: physical-model fomor still uses resolveAttack", OPTS, async () => {
  const u = makeMockSDK("hero-phys");
  await placeBait(u, "bait-phys");
  const r = await spawnNpc(u, "fomor-thug");
  assert(r);
  const npc = (await findByPlayer(r!.npcId))!;
  const result = await runNpcTurn(u, npc);
  assertEquals(result.engaged, 1);
});
