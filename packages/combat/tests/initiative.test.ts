/**
 * Engine initiative: ports supply rolls; combat sorts and activates.
 */
import { assertEquals, assert } from "@std/assert";
import {
  activateEncounter,
  joinActiveEncounter,
  sortByInitiative,
} from "../src/initiative.ts";
import type { CombatPorts } from "../src/ports.ts";
import type { EncounterStore } from "../src/store.ts";
import type { Encounter, Participant } from "../src/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function part(
  id: string,
  init = 0,
  kind: "pc" | "npc" = "pc",
): Participant {
  return {
    actorId: id,
    name: id,
    kind,
    initiative: init,
    appliedDefense: 0,
    isDodging: false,
    isOut: false,
  };
}

function memStore(initial: Encounter): EncounterStore {
  const map = new Map<string, Encounter>();
  map.set(initial.id, structuredClone(initial));
  return {
    async get(id) {
      const e = map.get(id);
      return e ? structuredClone(e) : null;
    },
    async create(enc) {
      map.set(enc.id, structuredClone(enc));
    },
    async save(enc) {
      map.set(enc.id, structuredClone(enc));
    },
    async advanceTurn() {
      return null;
    },
    async patchParticipant() {
      return null;
    },
  };
}

function portsWithRolls(
  rolls: Record<string, number>,
): CombatPorts {
  return {
    loadActor: () => Promise.resolve(null),
    executeAction: () => Promise.resolve({ ok: true }),
    broadcast: () => {},
    rollInitiative: (id) => Promise.resolve(rolls[id] ?? 0),
  };
}

Deno.test("sortByInitiative: higher first", OPTS, () => {
  const sorted = sortByInitiative(
    [part("a", 5), part("b", 12), part("c", 8)],
    () => 0.5,
  );
  assertEquals(sorted.map((p) => p.actorId), ["b", "c", "a"]);
});

Deno.test(
  "activateEncounter: rolls via ports, sets active",
  OPTS,
  async () => {
    const enc: Encounter = {
      id: "e1",
      roomId: "r1",
      round: 0,
      turnIdx: 0,
      status: "intent",
      createdAt: 0,
      participants: [part("slow"), part("fast"), part("mid")],
    };
    const store = memStore(enc);
    const out = await activateEncounter("e1", {
      ports: portsWithRolls({ slow: 3, fast: 20, mid: 10 }),
      store,
      rng: () => 0.5,
    });
    assert(out);
    assertEquals(out.status, "active");
    assertEquals(out.round, 1);
    assertEquals(out.turnIdx, 0);
    assertEquals(out.participants.map((p) => p.actorId), [
      "fast",
      "mid",
      "slow",
    ]);
    assertEquals(out.participants[0].initiative, 20);
  },
);

Deno.test(
  "joinActiveEncounter: inserts by rolled init",
  OPTS,
  async () => {
    const enc: Encounter = {
      id: "e2",
      roomId: "r1",
      round: 1,
      turnIdx: 0,
      status: "active",
      createdAt: 0,
      participants: [
        part("a", 15),
        part("b", 5),
      ],
    };
    const store = memStore(enc);
    const out = await joinActiveEncounter("e2", {
      ports: portsWithRolls({ c: 10 }),
      store,
      participant: {
        actorId: "c",
        name: "c",
        kind: "npc",
      },
    });
    assert(out);
    assertEquals(out.participants.map((p) => p.actorId), [
      "a",
      "c",
      "b",
    ]);
    // Inserted after current (idx 0), turnIdx stays 0.
    assertEquals(out.turnIdx, 0);
  },
);

Deno.test(
  "joinActiveEncounter: bump turnIdx when inserted before current",
  OPTS,
  async () => {
    const enc: Encounter = {
      id: "e3",
      roomId: "r1",
      round: 1,
      turnIdx: 1,
      status: "active",
      createdAt: 0,
      participants: [
        part("a", 15),
        part("b", 5),
      ],
    };
    const store = memStore(enc);
    const out = await joinActiveEncounter("e3", {
      ports: portsWithRolls({ c: 20 }),
      store,
      participant: {
        actorId: "c",
        name: "c",
        kind: "pc",
      },
    });
    assert(out);
    assertEquals(out.participants[0].actorId, "c");
    // Was on b (idx 1); insert at 0 → turnIdx becomes 2? 
    // insertAt=0 <= turnIdx=1 → turnIdx = 2
    // participants: c, a, b — current should still be b
    assertEquals(out.turnIdx, 2);
    assertEquals(out.participants[out.turnIdx].actorId, "b");
  },
);
