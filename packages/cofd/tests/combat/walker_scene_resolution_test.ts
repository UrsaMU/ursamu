// Walker test: when every NPC participant is isOut, the walker marks the
// encounter resolved.

import { assertEquals, assert } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  encounterDb,
} from "../../src/combat/encounter.ts";
import { advanceTurnSmart } from "../../src/combat/walker.ts";
import { mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seedActor(
  store: MockObjectStore, id: string, name: string, isNpc: boolean,
) {
  const sheet = defaultSheet();
  const flags = new Set<string>(isNpc ? ["npc", "thing"] : ["player", "connected"]);
  const obj = store.create({
    id, name, flags,
    state: { cofd: { ...sheet, npc: isNpc ? { aiArchetype: "beshilu-swarmer" } : undefined } },
  });
  // deno-lint-ignore no-explicit-any
  (obj as any).id = id;
  // deno-lint-ignore no-explicit-any
  (store as any).store.delete(obj.id);
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, obj);
  return obj;
}

Deno.test("walker marks encounter resolved when all NPCs are down", OPTS, async () => {
  const store = new MockObjectStore();
  const u = mockU({ me: { id: "pc1", name: "Alice" }, objectStore: store });
  seedActor(store, "pc1", "Alice", false);
  seedActor(store, "n1",  "Goon",  true);

  const enc = await createEncounter("room-resolve-1");
  for (const id of ["pc1", "n1"]) {
    const a = (store as unknown as { store: Map<string, unknown> }).store.get(id);
    await addParticipant(enc.id, a as Parameters<typeof addParticipant>[1]);
  }
  // Mark the NPC as isOut and the encounter as active with PC turn next.
  // deno-lint-ignore no-explicit-any
  const fresh = await encounterDb.findOne({ id: enc.id } as any);
  assert(fresh);
  const participants = fresh.participants.map((p) =>
    p.actorId === "n1" ? { ...p, isOut: true } : p
  );
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, {
    ...fresh, status: "active", turnIdx: 0, round: 1, participants,
  });

  const result = await advanceTurnSmart(enc.id, u as unknown as Parameters<typeof advanceTurnSmart>[1]);
  assert(result);
  assertEquals(result.status, "resolved");
});
