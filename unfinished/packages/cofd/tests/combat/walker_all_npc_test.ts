// Walker safety: when only NPCs remain and never go down, the walker is bounded
// by maxRounds and exits cleanly.

import { assert } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  encounterDb,
} from "../../src/combat/encounter.ts";
import { advanceTurnSmart } from "../../src/combat/walker.ts";
import { mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seedNpc(store: MockObjectStore, id: string, name: string) {
  const sheet = defaultSheet();
  const obj = store.create({
    id, name,
    flags: new Set<string>(["npc", "thing"]),
    state: { cofd: { ...sheet, npc: { aiArchetype: "beshilu-swarmer" } } },
  });
  // deno-lint-ignore no-explicit-any
  (obj as any).id = id;
  // deno-lint-ignore no-explicit-any
  (store as any).store.delete(obj.id);
  // deno-lint-ignore no-explicit-any
  (store as any).store.set(id, obj);
  return obj;
}

Deno.test("walker bounded by maxRounds when only NPCs present", OPTS, async () => {
  const store = new MockObjectStore();
  const u = mockU({ me: { id: "obs", name: "Observer" }, objectStore: store });
  seedNpc(store, "n1", "Goon1");
  seedNpc(store, "n2", "Goon2");

  const enc = await createEncounter("room-walker-allnpc");
  for (const id of ["n1", "n2"]) {
    const a = (store as unknown as { store: Map<string, unknown> }).store.get(id);
    await addParticipant(enc.id, a as Parameters<typeof addParticipant>[1]);
  }
  // deno-lint-ignore no-explicit-any
  const fresh = await encounterDb.findOne({ id: enc.id } as any);
  assert(fresh);
  // deno-lint-ignore no-explicit-any
  await encounterDb.update({ id: enc.id } as any, {
    ...fresh, status: "active", turnIdx: 0, round: 1, maxRounds: 2,
  });

  // Should not hang -- maxRounds * count = 4 iterations max.
  const result = await advanceTurnSmart(enc.id, u as unknown as Parameters<typeof advanceTurnSmart>[1]);
  assert(result, "walker should return an encounter object");
});
