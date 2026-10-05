/**
 * Victorian Lost (vctl.txt) → CtL 2e catalog integration.
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import {
  CTL_KITHS,
  CTL_CONTRACTS,
  findKith,
  findContract,
} from "../src/dictionary/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("vctl 2e: Inventor kith blessing is Inventive Genius", OPTS, () => {
  const k = findKith("Inventor");
  assertExists(k);
  assertEquals(k.seeming, "Wizened");
  assertEquals(k.blessing.includes("8-again"), true);
  assertEquals(k.blessing.toLowerCase().includes("wyrd"), true);
});

Deno.test("vctl 2e: Lurker kith blessing is Larcenous Fingers", OPTS, () => {
  const k = findKith("Lurker");
  assertExists(k);
  assertEquals(k.seeming, "Darkling");
  assertEquals(k.blessing.includes("9-again"), true);
  assertEquals(k.blessing.toLowerCase().includes("larceny"), true);
  assertEquals(k.blessing.includes("8-again"), true);
});

Deno.test("vctl 2e: Smoke-Stepping Mirror royal", OPTS, () => {
  const c = findContract("Smoke-Stepping");
  assertExists(c);
  assertEquals(c.type, "arcadian");
  assertEquals(c.regalia, "Mirror");
  assertEquals(c.tier, "royal");
  assertEquals(c.cost.includes("Glamour"), true);
  assertEquals((c.loophole ?? "").length > 3, true);
});

Deno.test("vctl 2e: Envoy's Splendor Crown common", OPTS, () => {
  const c = findContract("Envoy's Splendor");
  assertExists(c);
  assertEquals(c.type, "arcadian");
  assertEquals(c.regalia, "Crown");
  assertEquals(c.tier, "common");
});

Deno.test("vctl 2e: Riot and Sabotage goblin contracts", OPTS, () => {
  const riot = findContract("Riot");
  const sab = findContract("Sabotage");
  assertExists(riot);
  assertExists(sab);
  assertEquals(riot.type, "goblin");
  assertEquals(sab.type, "goblin");
  assertEquals(riot.cost.includes("Willpower"), true);
  assertEquals(sab.cost.includes("Willpower"), true);
});

Deno.test("vctl 2e: catalog sizes after import", OPTS, () => {
  assertEquals(CTL_KITHS.length >= 74, true);
  assertEquals(CTL_CONTRACTS.length >= 109, true);
  const vctl = CTL_CONTRACTS.filter((c) =>
    ["Smoke-Stepping", "Riot", "Sabotage", "Envoy's Splendor"]
      .includes(c.name)
  );
  assertEquals(vctl.length, 4);
});
