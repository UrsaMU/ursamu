/**
 * Minimum release smoke path for CofD + @ursamu/combat hybrid.
 *
 * Covers: encounter create → activate → NPC auto-turn (walker) →
 * halt on PC → all-NPC-out resolve. Asserts cofd.encounters collection.
 */
import { assert, assertEquals, assertExists } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  encounterDb,
} from "../../src/combat/encounter.ts";
import { advanceTurnSmart } from "../../src/combat/walker.ts";
import { initCofdCombat } from "../../src/combat/ports.ts";
import { mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// deno-lint-ignore no-explicit-any
type Q = any;

function seedActor(
  store: MockObjectStore,
  id: string,
  name: string,
  isNpc: boolean,
  ai = "beshilu-swarmer",
) {
  const sheet = defaultSheet();
  const flags = new Set<string>(
    isNpc ? ["npc", "thing"] : ["player", "connected"],
  );
  const obj = store.create({
    id,
    name,
    flags,
    state: {
      cofd: {
        ...sheet,
        npc: isNpc ? { aiArchetype: ai } : undefined,
      },
    },
  });
  // deno-lint-ignore no-explicit-any
  (obj as any).id = id;
  // deno-lint-ignore no-explicit-any
  (store as any).store.delete(obj.id);
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, obj);
  return obj;
}

function actor(store: MockObjectStore, id: string) {
  // deno-lint-ignore no-explicit-any
  return (store as any).store.get(id);
}

Deno.test(
  "release: encounter collection is cofd.encounters (not combat.*)",
  OPTS,
  () => {
    // DBO.namespace is the collection key used at runtime.
    // deno-lint-ignore no-explicit-any
    const ns = (encounterDb as any).namespace;
    const name = typeof ns === "function" ? ns() : ns;
    assertEquals(
      name,
      "cofd.encounters",
      "CofD must keep writing cofd.encounters for live DB compat",
    );
  },
);

Deno.test(
  "release smoke: start → NPC auto-turn → halt on PC",
  OPTS,
  async () => {
    initCofdCombat();
    const store = new MockObjectStore();
    const u = mockU({
      me: { id: "pc1", name: "Alice" },
      objectStore: store,
    });
    const broadcasts: string[] = [];
    // deno-lint-ignore no-explicit-any
    (u as any).here = {
      id: "room-smoke",
      name: "Smoke Room",
      flags: new Set(["room"]),
      state: {},
      contents: [],
      broadcast: (m: string) => broadcasts.push(m),
    };

    seedActor(store, "pc1", "Alice", false);
    seedActor(store, "n1", "Goon", true, "beshilu-swarmer");
    seedActor(store, "pc2", "Bob", false);

    const enc = await createEncounter("room-smoke");
    assertExists(enc.id);
    assertEquals(enc.status, "intent");

    for (const id of ["pc1", "n1", "pc2"]) {
      await addParticipant(
        enc.id,
        actor(store, id) as Parameters<typeof addParticipant>[1],
      );
    }

    const mid = await encounterDb.findOne({ id: enc.id } as Q);
    assertExists(mid);
    assertEquals(mid.participants.length, 3);

    // Activate with turn on NPC (index 1).
    await encounterDb.update({ id: enc.id } as Q, {
      ...mid,
      status: "active",
      turnIdx: 1,
      round: 1,
      maxRounds: 10,
    });

    const after = await advanceTurnSmart(
      enc.id,
      u as unknown as Parameters<typeof advanceTurnSmart>[1],
    );
    assertExists(after);
    assertEquals(after.status, "active");

    const cur = after.participants[after.turnIdx];
    assertExists(cur);
    // Walker must leave control on a live PC after NPC auto-turn(s).
    assertEquals(cur.kind, "pc");
    assertEquals(cur.isOut, false);
  },
);

Deno.test(
  "release smoke: all NPCs out → scene resolves",
  OPTS,
  async () => {
    initCofdCombat();
    const store = new MockObjectStore();
    const u = mockU({
      me: { id: "pc1", name: "Alice" },
      objectStore: store,
    });
    // deno-lint-ignore no-explicit-any
    (u as any).here = {
      id: "room-res",
      broadcast: () => {},
      flags: new Set(["room"]),
      state: {},
      contents: [],
    };

    seedActor(store, "pc1", "Alice", false);
    seedActor(store, "n1", "Goon", true);

    const enc = await createEncounter("room-res");
    for (const id of ["pc1", "n1"]) {
      await addParticipant(
        enc.id,
        actor(store, id) as Parameters<typeof addParticipant>[1],
      );
    }
    const mid = await encounterDb.findOne({ id: enc.id } as Q);
    assertExists(mid);
    const participants = mid.participants.map((p) =>
      p.actorId === "n1" ? { ...p, isOut: true } : p
    );
    await encounterDb.update({ id: enc.id } as Q, {
      ...mid,
      status: "active",
      turnIdx: 0,
      round: 1,
      participants,
    });

    const result = await advanceTurnSmart(
      enc.id,
      u as unknown as Parameters<typeof advanceTurnSmart>[1],
    );
    assertExists(result);
    assertEquals(result.status, "resolved");
  },
);

Deno.test(
  "release smoke: manual AI halts walker on that NPC",
  OPTS,
  async () => {
    initCofdCombat();
    const store = new MockObjectStore();
    const u = mockU({
      me: { id: "pc1", name: "Alice" },
      objectStore: store,
    });
    // deno-lint-ignore no-explicit-any
    (u as any).here = {
      id: "room-man",
      broadcast: () => {},
      flags: new Set(["room"]),
      state: {},
      contents: [],
    };

    seedActor(store, "pc1", "Alice", false);
    seedActor(store, "n1", "Boss", true, "manual");

    const enc = await createEncounter("room-man");
    for (const id of ["pc1", "n1"]) {
      await addParticipant(
        enc.id,
        actor(store, id) as Parameters<typeof addParticipant>[1],
      );
    }
    const mid = await encounterDb.findOne({ id: enc.id } as Q);
    await encounterDb.update({ id: enc.id } as Q, {
      ...mid!,
      status: "active",
      turnIdx: 1,
      round: 1,
    });

    const result = await advanceTurnSmart(
      enc.id,
      u as unknown as Parameters<typeof advanceTurnSmart>[1],
    );
    assertExists(result);
    assertEquals(result.status, "active");
    assertEquals(result.turnIdx, 1);
    assertEquals(result.participants[1].actorId, "n1");
  },
);
