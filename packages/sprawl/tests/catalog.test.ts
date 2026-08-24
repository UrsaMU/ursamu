import { assertEquals, assert } from "@std/assert";
import {
  BACKGROUNDS,
  BELONGINGS,
  CHARGEN,
  FIREARMS,
  FLOW_LOCATIONS,
  STATS,
  find,
  pickByRoll,
} from "../engine/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("stats are five", OPTS, () => {
  assertEquals(STATS.length, 5);
  assertEquals(CHARGEN.statPoints, 4);
  assertEquals(CHARGEN.resilience, 12);
});

Deno.test("backgrounds have edges", OPTS, () => {
  assert(BACKGROUNDS.length >= 30);
  const n = find("background", "nodejacker");
  assert(n);
  assert((n.edge as { name: string }).name);
});

Deno.test("belongings d66 covers 36", OPTS, () => {
  assertEquals(BELONGINGS.length, 36);
  const b = pickByRoll(BELONGINGS, "13");
  assertEquals(b?.slug, "armour");
});

Deno.test("firearms have costs", OPTS, () => {
  const g = find("firearm", "p226");
  assert(g);
  assertEquals(g.cost, 450);
});

Deno.test("flow has 80 locations", OPTS, () => {
  assertEquals(FLOW_LOCATIONS.length, 80);
  const a = FLOW_LOCATIONS.find((l) => Number(l.num) === 1);
  assert(a);
  assert(String(a.name).includes("Apex"));
});
