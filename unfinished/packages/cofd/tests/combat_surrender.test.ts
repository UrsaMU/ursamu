// +combat/surrender -- declare surrender; attackers cannot target.
// Verifies the flag blocks +attack and clears on aggressive action.

import { assert, assertEquals } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  getEncounterForRoom,
  rollInitiative,
  setSurrendered,
} from "../src/combat/encounter.ts";
import { mockPlayer, mockU, MockObjectStore } from "./helpers/mockU.ts";
import { defaultSheet } from "../src/stats/index.ts";
import { attackExec } from "../src/commands/attack.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seed(store: MockObjectStore, id: string, name: string) {
  const sheet = defaultSheet();
  sheet.attributes.strength = 3;
  sheet.attributes.dexterity = 3;
  sheet.attributes.wits = 2;
  sheet.skills.brawl = 2;
  sheet.skills.athletics = 2;
  const obj = mockPlayer({ id, name, state: { cofd: sheet } });
  const rawStore = (store as unknown as {
    store: Map<string, Record<string, unknown>>;
  }).store;
  rawStore.set(id, obj as unknown as Record<string, unknown>);
  return obj;
}

Deno.test("surrendered participant blocks +attack", OPTS, async () => {
  const store = new MockObjectStore();
  const attackerId = "atk-" + crypto.randomUUID();
  const victimId = "vic-" + crypto.randomUUID();
  const attacker = seed(store, attackerId, "Attila");
  const victim = seed(store, victimId, "Vincent");
  const roomId = "room-surr-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  await addParticipant(enc.id, attacker);
  await addParticipant(enc.id, victim);

  // Wire u.db.search to find the victim by id.
  const u = mockU({ me: attacker, objectStore: store, args: ["Vincent"] });
  (u as unknown as { here: Record<string, unknown> }).here = {
    id: roomId,
    broadcast: () => {},
  };
  (u.db as unknown as Record<string, unknown>).search = (
    q: Record<string, unknown>,
  ) => {
    if (q.id) {
      const f = store.get(q.id as string);
      return Promise.resolve(f ? [f] : []);
    }
    return Promise.resolve(store.search(q));
  };
  (u.util as unknown as Record<string, unknown>).target = () =>
    Promise.resolve(victim);

  await rollInitiative(enc.id, u);
  // Surrender victim.
  await setSurrendered(enc.id, victim.id, true);
  // Force attacker's turn for test determinism (re-fetch AFTER setSurrendered).
  const fresh = await getEncounterForRoom(roomId);
  assert(fresh);
  const idx = fresh.participants.findIndex((p) => p.actorId === attacker.id);
  const { encounterDb } = await import("../src/combat/encounter.ts");
  await encounterDb.update(
    { id: enc.id } as unknown as Record<string, unknown>,
    { ...fresh, turnIdx: idx },
  );

  await attackExec(u);
  const sent = (u as unknown as { _sent: string[] })._sent;
  assert(
    sent.some((m: string) => /surrender/i.test(m)),
    "expected surrender rejection, got: " + sent.join(" | "),
  );
  // Victim sheet untouched.
  const vicObj = store.get(victimId) as unknown as {
    state: { cofd: { health: { bashing: number } } };
  };
  assertEquals(vicObj.state.cofd.health.bashing, 0);
});

Deno.test("aggressive action clears surrender flag", OPTS, async () => {
  // setSurrendered + then attack -> flag cleared on attacker's record.
  const store = new MockObjectStore();
  const attackerId = "atk2-" + crypto.randomUUID();
  const victimId = "vic2-" + crypto.randomUUID();
  const attacker = seed(store, attackerId, "Attila");
  const victim = seed(store, victimId, "Vincent");
  const roomId = "room-surr2-" + crypto.randomUUID();
  const enc = await createEncounter(roomId);
  await addParticipant(enc.id, attacker);
  await addParticipant(enc.id, victim);

  const u = mockU({ me: attacker, objectStore: store, args: ["Vincent"] });
  (u as unknown as { here: Record<string, unknown> }).here = {
    id: roomId,
    broadcast: () => {},
  };
  (u.db as unknown as Record<string, unknown>).search = (
    q: Record<string, unknown>,
  ) => {
    if (q.id) {
      const f = store.get(q.id as string);
      return Promise.resolve(f ? [f] : []);
    }
    return Promise.resolve(store.search(q));
  };
  (u.util as unknown as Record<string, unknown>).target = () =>
    Promise.resolve(victim);

  await rollInitiative(enc.id, u);
  // Attacker surrenders, then attacks. Surrender should clear.
  await setSurrendered(enc.id, attacker.id, true);
  const pre = await getEncounterForRoom(roomId);
  assert(pre);
  const idx = pre.participants.findIndex((p) => p.actorId === attacker.id);
  const { encounterDb } = await import("../src/combat/encounter.ts");
  await encounterDb.update(
    { id: enc.id } as unknown as Record<string, unknown>,
    { ...pre, turnIdx: idx },
  );

  await attackExec(u);
  const post = await getEncounterForRoom(roomId);
  assert(post);
  const aP = post.participants.find((p) => p.actorId === attacker.id);
  assertEquals(aP?.surrendered, false, "aggression should clear surrender");
});
