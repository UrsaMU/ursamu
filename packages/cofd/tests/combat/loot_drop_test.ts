// Test loot table lookup and drop helper.

import { assertEquals, assert } from "@std/assert";
import { lootFor } from "../../src/combat/loot.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("lootFor hunter-cell-shooter returns pistol + magazines", OPTS, () => {
  const entries = lootFor("hunter-cell-shooter");
  assertEquals(entries.length, 2);
  const keys = entries.map((e) => e.key).sort();
  assertEquals(keys, ["magazine-9mm-light", "pistol-light"]);
  const mag = entries.find((e) => e.key === "magazine-9mm-light");
  assert(mag);
  assertEquals(mag!.count, 2);
});

Deno.test("lootFor beshilu-swarmer returns []", OPTS, () => {
  assertEquals(lootFor("beshilu-swarmer"), []);
});

Deno.test("lootFor unknown archetype returns []", OPTS, () => {
  assertEquals(lootFor("not-a-real-archetype"), []);
});
