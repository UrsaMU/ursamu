// After a PC spends their instant action, endTurnAndWalk must step past
// the PC and auto-run NPC AI until the next live PC (or manual NPC).

import { assertEquals, assert } from "@std/assert";
import {
  addParticipant,
  createEncounter,
  encounterDb,
  setActionUsed,
} from "../../src/combat/encounter.ts";
import { endTurnAndWalk } from "../../src/combat/auto.ts";
import { advanceTurnSmart } from "../../src/combat/walker.ts";
import { mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import type { IUrsamuSDK } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function seedActor(
  store: MockObjectStore,
  id: string,
  name: string,
  isNpc = false,
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

Deno.test(
  "endTurnAndWalk steps past PC and auto-runs NPCs",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const u = mockU({
      me: { id: "pc1", name: "Alice", flags: new Set(["player", "connected"]) },
      objectStore: store,
    });
    seedActor(store, "pc1", "Alice", false);
    seedActor(store, "n1", "Goon1", true);
    seedActor(store, "n2", "Goon2", true);
    seedActor(store, "pc2", "Bob", false);

    const enc = await createEncounter("room-auto-pc");
    for (const id of ["pc1", "n1", "n2", "pc2"]) {
      const a = (store as unknown as { store: Map<string, unknown> })
        .store.get(id);
      await addParticipant(
        enc.id,
        a as Parameters<typeof addParticipant>[1],
      );
    }
    // deno-lint-ignore no-explicit-any
    const fresh = await encounterDb.findOne({ id: enc.id } as any);
    assert(fresh);
    // deno-lint-ignore no-explicit-any
    await encounterDb.update({ id: enc.id } as any, {
      ...fresh,
      status: "active",
      turnIdx: 0,
      round: 1,
    });

    // PC spent their action (as +attack does) then endTurnAndWalk.
    await setActionUsed(enc.id, "pc1", true);
    await endTurnAndWalk(
      u as unknown as IUrsamuSDK,
      enc.id,
    );

    // deno-lint-ignore no-explicit-any
    const after = await encounterDb.findOne({ id: enc.id } as any);
    assert(after);
    const cur = after.participants[after.turnIdx];
    assert(cur);
    // Walker should have left us on Bob (pc2), not on an NPC.
    assertEquals(cur.actorId, "pc2");
    assertEquals(cur.kind, "pc");
  },
);

Deno.test(
  "manual AI archetype halts walker on that NPC",
  OPTS,
  async () => {
    const store = new MockObjectStore();
    const u = mockU({
      me: { id: "pc1", name: "Alice" },
      objectStore: store,
    });
    seedActor(store, "pc1", "Alice", false);
    seedActor(store, "boss", "Boss", true, "manual");
    seedActor(store, "pc2", "Bob", false);

    const enc = await createEncounter("room-manual-ai");
    for (const id of ["pc1", "boss", "pc2"]) {
      const a = (store as unknown as { store: Map<string, unknown> })
        .store.get(id);
      await addParticipant(
        enc.id,
        a as Parameters<typeof addParticipant>[1],
      );
    }
    // deno-lint-ignore no-explicit-any
    const fresh = await encounterDb.findOne({ id: enc.id } as any);
    assert(fresh);
    // Start on the manual NPC (as if we just stepped onto them).
    // deno-lint-ignore no-explicit-any
    await encounterDb.update({ id: enc.id } as any, {
      ...fresh,
      status: "active",
      turnIdx: 1,
      round: 1,
    });

    const result = await advanceTurnSmart(
      enc.id,
      u as unknown as Parameters<typeof advanceTurnSmart>[1],
    );
    assert(result);
    const cur = result.participants[result.turnIdx];
    assert(cur);
    // Must stop on the manual NPC, not auto-skip to Bob.
    assertEquals(cur.actorId, "boss");
    assertEquals(cur.kind, "npc");
  },
);
