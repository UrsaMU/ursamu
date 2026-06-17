// Suppressive fire: deals zero damage and pins every other participant.
// Exploiter test: confirms /suppress can't be used to sneak damage past
// the no-damage rule.

import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  applySuppression,
  createEncounter,
  getEncounterForRoom,
  rollInitiative,
} from "../src/combat/encounter.ts";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seedActor(store: MockObjectStore, id: string, name: string) {
  const sheet = defaultSheet();
  sheet.attributes.Dexterity = 3;
  sheet.attributes.Composure = 2;
  const obj = store.create({
    id,
    name,
    flags: new Set(["player", "connected"]),
    state: { cofd: sheet },
  });
  obj.id = id;
  const rawStore = (store as unknown as {
    store: Map<string, Record<string, unknown>>;
  }).store;
  rawStore.delete(obj.id);
  rawStore.set(id, obj as unknown as Record<string, unknown>);
  return obj;
}

Deno.test("applySuppression pins every other participant", OPTS, async () => {
  const store = new MockObjectStore();
  const u = mockU({ me: mockPlayer({ id: "alice", name: "Alice" }), objectStore: store });
  const enc = await createEncounter("room-suppress-1");
  const alice = seedActor(store, "alice", "Alice");
  const bob = seedActor(store, "bob", "Bob");
  const cass = seedActor(store, "cass", "Cass");
  await addParticipant(enc.id, alice);
  await addParticipant(enc.id, bob);
  await addParticipant(enc.id, cass);
  (u.db as unknown as Record<string, unknown>).search = (
    q: Record<string, unknown>,
  ) => {
    if (q.id) {
      const found = store.get(q.id as string);
      return Promise.resolve(found ? [found] : []);
    }
    return Promise.resolve(store.search(q));
  };
  await rollInitiative(enc.id, u);

  const updated = await applySuppression(enc.id, "alice");
  assert(updated);
  const live = await getEncounterForRoom("room-suppress-1");
  assert(live);
  // Alice (suppressor) is not pinned by herself.
  const aliceP = live.participants.find((p) => p.actorId === "alice");
  assertEquals(aliceP?.pinnedBy, undefined);
  // Everyone else is pinned by alice.
  for (const id of ["bob", "cass"]) {
    const p = live.participants.find((x) => x.actorId === id);
    assertEquals(p?.pinnedBy, "alice", `${id} should be pinned by alice`);
  }
});

Deno.test("suppression applies no damage to participants", OPTS, async () => {
  // Suppression doesn't touch sheet.health -- enforce by checking that
  // applySuppression leaves the participant's actor sheet untouched.
  const store = new MockObjectStore();
  const u = mockU({ me: mockPlayer({ id: "shooter", name: "Shooter" }), objectStore: store });
  const enc = await createEncounter("room-suppress-2");
  const shooter = seedActor(store, "shooter", "Shooter");
  const victim = seedActor(store, "victim", "Victim");
  await addParticipant(enc.id, shooter);
  await addParticipant(enc.id, victim);
  (u.db as unknown as Record<string, unknown>).search = (
    q: Record<string, unknown>,
  ) => {
    if (q.id) {
      const f = store.get(q.id as string);
      return Promise.resolve(f ? [f] : []);
    }
    return Promise.resolve(store.search(q));
  };
  await rollInitiative(enc.id, u);

  const vicBefore = store.get("victim") as unknown as {
    state: { cofd: { health: unknown } };
  };
  const before = JSON.stringify(vicBefore.state.cofd.health);
  await applySuppression(enc.id, "shooter");
  const vicAfter = store.get("victim") as unknown as {
    state: { cofd: { health: unknown } };
  };
  const after = JSON.stringify(vicAfter.state.cofd.health);
  assertEquals(after, before, "suppression must not modify victim health");
});
