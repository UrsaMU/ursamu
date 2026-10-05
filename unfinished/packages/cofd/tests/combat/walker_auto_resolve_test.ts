// Walker test: PC NPC NPC PC2 order -- /next halts on PC2 after AI runs both NPCs.

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
  store: MockObjectStore,
  id: string,
  name: string,
  isNpc = false,
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

Deno.test("walker halts at next live PC after AI runs NPCs", OPTS, async () => {
  const store = new MockObjectStore();
  const u = mockU({ me: { id: "pc1", name: "Alice" }, objectStore: store });
  seedActor(store, "pc1", "Alice", false);
  seedActor(store, "n1",  "Goon1", true);
  seedActor(store, "n2",  "Goon2", true);
  seedActor(store, "pc2", "Bob",   false);

  const enc = await createEncounter("room-walker-1");
  // Add actors in initiative order: pc1, n1, n2, pc2.
  for (const id of ["pc1", "n1", "n2", "pc2"]) {
    const a = (store as unknown as { store: Map<string, unknown> }).store.get(id);
    await addParticipant(enc.id, a as Parameters<typeof addParticipant>[1]);
  }
  // Mark active with explicit turnIdx=1 (on n1) so the walker takes over.
  // deno-lint-ignore no-explicit-any
  const fresh = await encounterDb.findOne({ id: enc.id } as any);
  assert(fresh);
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, { ...fresh, status: "active", turnIdx: 1, round: 1 });

  const result = await advanceTurnSmart(enc.id, u as unknown as Parameters<typeof advanceTurnSmart>[1]);
  assert(result);
  // After the walker, current slot should be pc2 (a PC) -- not an NPC slot.
  const cur = result.participants[result.turnIdx];
  assert(cur);
  assertEquals(cur.kind, "pc");
});
