// Durability / Structure / broken state.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import { defaultSheet } from "../../src/stats/index.ts";
import {
  createItem,
  damageItem,
  equipItem,
  itemData,
  repairItem,
} from "../../src/equipment/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("damageItem", OPTS, () => {
  it("clamps structure at 0 and flips broken", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    const item = await createItem(u, "p1", "knife");
    assert(item);
    const d = itemData(item)!;
    const result = await damageItem(u, item.id, (d.structure ?? 0) + 99);
    assertEquals(result.newStructure, 0);
    assertEquals(result.broken, true);
  });

  it("force-unequips broken items and clears sheet pointer", async () => {
    const store = new MockObjectStore();
    const ownerId = "p2";
    const sheet = defaultSheet();
    const me = mockPlayer({ id: ownerId, state: { cofd: sheet } });
    const u = mockU({
      me,
      objectStore: store,
      dbModify: (_id, op, data) => {
        const d = data as Record<string, unknown>;
        if (op === "$set" && d["data.cofd"]) me.state.cofd = d["data.cofd"];
        return Promise.resolve();
      },
    });
    // owner must be in the store so damageItem can clear the sheet pointer.
    store["store" as keyof typeof store];
    (store as unknown as { store: Map<string, unknown> }).store.set(ownerId, me as unknown as never);
    const knife = await createItem(u, ownerId, "knife");
    assert(knife);
    const eq = await equipItem(u, ownerId, 1, null, null);
    assert(!eq.error);
    // Set sheet pointer.
    (me.state.cofd as ReturnType<typeof defaultSheet>).equipment = {
      equippedWeapon: knife.id,
      equippedArmor: null,
    };
    const result = await damageItem(u, knife.id, 999);
    assertEquals(result.broken, true);
    assertEquals(result.autoUnequipped, true);
    assertEquals(result.slot, "weapon");
    assertEquals((me.state.cofd as ReturnType<typeof defaultSheet>).equipment?.equippedWeapon, null);
    const updated = store.get(knife.id);
    assertEquals(updated?.flags.has("dark"), false);
    assertEquals(itemData(updated!)?.equippedBy, undefined);
  });

  it("repair clamps at maxStructure", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p3" }), objectStore: store });
    const item = await createItem(u, "p3", "knife");
    assert(item);
    await damageItem(u, item.id, 2);
    const r = await repairItem(u, item.id, 999);
    const d = itemData(store.get(item.id)!)!;
    assertEquals(r.newStructure, d.maxStructure);
    assertEquals(d.broken, false);
  });
});
