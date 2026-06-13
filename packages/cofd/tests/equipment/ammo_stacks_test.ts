// Ammo stack auto-merge and splitStack invariants.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import {
  carriedItems,
  createItem,
  itemData,
  splitStack,
} from "../../src/equipment/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("ammo stacks", OPTS, () => {
  it("auto-merges on createItem when stack exists", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    const a = await createItem(u, "p1", "magazine-9mm-light");
    const b = await createItem(u, "p1", "magazine-9mm-light");
    assert(a && b);
    assertEquals(a.id, b.id, "second add should merge into first stack");
    const carried = await carriedItems(u, "p1");
    assertEquals(carried.length, 1);
    assertEquals(itemData(carried[0])?.count, 2);
  });

  it("splitStack errors at n < 1", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p2" }), objectStore: store });
    const a = await createItem(u, "p2", "magazine-9mm-light");
    await createItem(u, "p2", "magazine-9mm-light");
    assert(a);
    const r = await splitStack(u, a.id, 0);
    assert(typeof r === "object" && "error" in r);
  });

  it("splitStack errors at n >= count", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p3" }), objectStore: store });
    const a = await createItem(u, "p3", "magazine-9mm-light");
    await createItem(u, "p3", "magazine-9mm-light");
    assert(a);
    const r = await splitStack(u, a.id, 2);
    assert(typeof r === "object" && "error" in r);
  });

  it("valid split produces two stacks with correct counts", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p4" }), objectStore: store });
    const a = await createItem(u, "p4", "magazine-9mm-light");
    await createItem(u, "p4", "magazine-9mm-light");
    await createItem(u, "p4", "magazine-9mm-light");
    assert(a);
    const r = await splitStack(u, a.id, 1);
    assert(typeof r === "string", "expected new stack id");
    const carried = await carriedItems(u, "p4");
    const counts = carried.map((o) => itemData(o)?.count ?? 0).sort();
    assertEquals(counts, [1, 2]);
  });
});
