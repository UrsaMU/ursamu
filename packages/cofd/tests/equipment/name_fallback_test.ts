// resolveItemRef by index, by name, fallthrough.

import { assert, assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU, MockObjectStore } from "../helpers/mockU.ts";
import type { IDBObj } from "@ursamu/ursamu";
import {
  createItem,
  isAmbiguousMatch,
  itemData,
  resolveItemRef,
} from "../../src/equipment/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("resolveItemRef", OPTS, () => {
  it("resolves by 1-based index", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p1" }), objectStore: store });
    await createItem(u, "p1", "knife");
    const rifle = await createItem(u, "p1", "rifle");
    assert(rifle);
    const got = await resolveItemRef(u, "p1", "2");
    assert(got && !isAmbiguousMatch(got));
    assertEquals((got as IDBObj).id, rifle.id);
  });

  it("resolves by case-insensitive substring", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p2" }), objectStore: store });
    await createItem(u, "p2", "knife");
    await createItem(u, "p2", "rifle");
    const got = await resolveItemRef(u, "p2", "RIF");
    assert(got && !isAmbiguousMatch(got));
    assertEquals(itemData(got as IDBObj)?.key, "rifle");
  });

  it("returns ambiguous shape when multiple items match", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p3" }), objectStore: store });
    const knife = await createItem(u, "p3", "knife");
    await createItem(u, "p3", "knife-small");
    assert(knife);
    const got = await resolveItemRef(u, "p3", "knife") as
      | { ambiguous?: boolean; matches?: unknown[] }
      | null;
    assert(got && got.ambiguous === true);
    assert(Array.isArray(got.matches) && got.matches.length === 2);
  });

  it("returns null on no match", async () => {
    const store = new MockObjectStore();
    const u = mockU({ me: mockPlayer({ id: "p4" }), objectStore: store });
    await createItem(u, "p4", "knife");
    const got = await resolveItemRef(u, "p4", "nothing");
    assertEquals(got, null);
  });
});
