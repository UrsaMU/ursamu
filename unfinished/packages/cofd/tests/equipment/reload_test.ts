// consumeReload happy path, errors, stack destruction.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import {
  carriedItems,
  consumeReload,
  createItem,
  itemData,
  lookupItem,
} from "../../src/equipment/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("consumeReload", OPTS, () => {
  it("refills clip and decrements stack", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    const weapon = await createItem(u, "p1", "pistol-light");
    const mag = await createItem(u, "p1", "magazine-9mm-light");
    await createItem(u, "p1", "magazine-9mm-light"); // count -> 2
    assert(weapon && mag);
    // burn the clip down
    store.modify(weapon.id, "$set", {
      "data.cofd_item": { ...itemData(weapon)!, currentClip: 0 },
    });
    const r = await consumeReload(u, "p1", store.get(weapon.id)!);
    assertEquals(r.ok, true);
    const clip = (lookupItem("pistol-light")!.entry as { clip: number }).clip;
    assertEquals(itemData(store.get(weapon.id)!)?.currentClip, clip);
    const stack = (await carriedItems(u, "p1")).find((o) => itemData(o)?.kind === "ammo");
    assertEquals(itemData(stack!)?.count, 1);
  });

  it("destroys stack at count=0", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p2" }), objectStore: store });
    const weapon = await createItem(u, "p2", "pistol-light");
    await createItem(u, "p2", "magazine-9mm-light"); // count = 1
    assert(weapon);
    const r = await consumeReload(u, "p2", store.get(weapon.id)!);
    assertEquals(r.ok, true);
    const ammo = (await carriedItems(u, "p2")).filter((o) => itemData(o)?.kind === "ammo");
    assertEquals(ammo.length, 0);
  });

  it("errors when no matching stack in inventory", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p3" }), objectStore: store });
    const weapon = await createItem(u, "p3", "pistol-light");
    assert(weapon);
    const r = await consumeReload(u, "p3", store.get(weapon.id)!);
    assertEquals(r.ok, false);
    assertEquals(r.error, "no-stack");
  });
});
