/**
 * Generic encounter lifecycle over an in-memory store.
 */
import { assert, assertEquals } from "@std/assert";
import {
  beginEncounter,
  endEncounter,
  findRoomEncounter,
  joinEncounter,
  leaveEncounter,
  nextTurn,
  startEncounter,
} from "../src/lifecycle.ts";
import type { EncounterStore } from "../src/store.ts";
import type { Encounter, Participant } from "../src/types.ts";
import type { CombatPorts } from "../src/ports.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function memStore(): EncounterStore {
  const map = new Map<string, Encounter>();
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
    async findInRoom(roomId) {
      const all = [...map.values()].filter(
        (e) =>
          e.roomId === roomId &&
          (e.status === "intent" || e.status === "active"),
      );
      return (
        all.find((e) => e.status === "active") ?? all[0] ?? null
      );
    },
    async advanceTurn(id) {
      const enc = map.get(id);
      if (!enc || enc.status !== "active") return enc ?? null;
      const n = enc.participants.length;
      if (!n) return enc;
      let turnIdx = enc.turnIdx + 1;
      let round = enc.round;
      let participants = enc.participants;
      if (turnIdx >= n) {
        turnIdx = 0;
        round += 1;
        participants = participants.map((p) => ({
          ...p,
          appliedDefense: 0,
          isDodging: false,
          actionUsed: false,
          movedThisRound: false,
          ran: false,
          delayed: false,
        }));
      }
      const updated = { ...enc, turnIdx, round, participants };
      map.set(id, updated);
      return structuredClone(updated);
    },
    async patchParticipant(eid, aid, patch) {
      const enc = map.get(eid);
      if (!enc) return null;
      const participants = enc.participants.map((p) =>
        p.actorId === aid ? { ...p, ...patch } : p
      );
      const updated = { ...enc, participants };
      map.set(eid, updated);
      return structuredClone(updated);
    },
  };
}

function ports(rolls: Record<string, number>): CombatPorts {
  return {
    loadActor: async () => null,
    executeAction: async () => ({ ok: true }),
    broadcast: () => {},
    rollInitiative: async (id) => rolls[id] ?? 0,
  };
}

Deno.test("lifecycle: start → join → begin → next → end", OPTS, async () => {
  const store = memStore();
  const enc = await startEncounter("r1", { store, name: "T" });
  assertEquals(enc.status, "intent");
  assertEquals(enc.participants.length, 0);

  await joinEncounter(
    enc.id,
    { actorId: "a", name: "A", kind: "pc" },
    { store },
  );
  await joinEncounter(
    enc.id,
    { actorId: "b", name: "B", kind: "npc" },
    { store },
  );

  const found = await findRoomEncounter("r1", { store });
  assert(found);
  assertEquals(found.participants.length, 2);

  const active = await beginEncounter(enc.id, {
    store,
    ports: ports({ a: 5, b: 15 }),
    rng: () => 0.5,
  });
  assert(active);
  assertEquals(active.status, "active");
  assertEquals(active.participants[0].actorId, "b"); // higher init
  assertEquals(active.turnIdx, 0);

  const stepped = await nextTurn(enc.id, { store });
  assert(stepped);
  assertEquals(stepped.turnIdx, 1);

  const left = await leaveEncounter(enc.id, "a", { store });
  assert(left);
  assertEquals(left.encounter.participants.length, 1);

  const ended = await endEncounter(enc.id, { store });
  assert(ended);
  assertEquals(ended.status, "resolved");
});

Deno.test("lifecycle: join active rolls init", OPTS, async () => {
  const store = memStore();
  const enc = await startEncounter("r2", { store });
  await joinEncounter(
    enc.id,
    { actorId: "a", name: "A", kind: "pc" },
    { store },
  );
  await beginEncounter(enc.id, {
    store,
    ports: ports({ a: 10 }),
    rng: () => 0.5,
  });
  const after = await joinEncounter(
    enc.id,
    { actorId: "c", name: "C", kind: "npc" },
    { store, ports: ports({ c: 20 }) },
  );
  assert(after);
  assertEquals(after.participants[0].actorId, "c");
  assertEquals(after.participants.length, 2);
});
