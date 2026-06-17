// Test the getCoverDurability helper handles both legacy and CoverState shapes.

import { assertEquals } from "@std/assert";
import { getCoverDurability, type Participant } from "../../src/combat/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function mk(over: Partial<Participant> = {}): Participant {
  return {
    actorId: "x", name: "x", initiative: 0, appliedDefense: 0,
    isDodging: false, isOut: false, ...over,
  };
}

Deno.test("getCoverDurability: undefined cover -> 0", OPTS, () => {
  assertEquals(getCoverDurability(mk()), 0);
});

Deno.test("getCoverDurability: legacy number cover", OPTS, () => {
  assertEquals(getCoverDurability(mk({ cover: 2 })), 2);
});

Deno.test("getCoverDurability: structured CoverState", OPTS, () => {
  const p = mk({
    cover: { durability: 3, structure: 5, maxStructure: 5, name: "Brick Wall" },
  });
  assertEquals(getCoverDurability(p), 3);
});
