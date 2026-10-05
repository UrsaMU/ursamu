/**
 * Unit tests for chargen HTTP helpers (options catalog + pure shapes).
 */
import { assertEquals, assertExists } from "jsr:@std/assert@1";
import { chargenOptions } from "../src/chargen/http.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("chargenOptions virtues", OPTS, async () => {
  const res = await chargenOptions("virtues");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(Array.isArray(body.items), true);
  assertEquals(body.items.length > 0, true);
  assertExists(body.items[0].name);
});

Deno.test("chargenOptions templates filtered", OPTS, async () => {
  const res = await chargenOptions("templates");
  const body = await res.json();
  const keys = body.items.map((i: { key: string }) => i.key);
  assertEquals(keys.includes("changeling"), true);
  assertEquals(keys.includes("mortal"), true);
  // Closed for chargen for now (still in COFD_TEMPLATES).
  assertEquals(keys.includes("werewolf"), false);
  assertEquals(keys.includes("fetch"), false);
  assertEquals(keys.includes("hobgoblin"), false);
  assertEquals(keys.includes("huntsman"), false);
});

Deno.test("chargenOptions attributes groups", OPTS, async () => {
  const res = await chargenOptions("attributes");
  const body = await res.json();
  assertEquals(body.mental.length, 3);
  assertEquals(body.physical.length, 3);
  assertEquals(body.social.length, 3);
});

Deno.test("chargenOptions unknown topic 404", OPTS, async () => {
  const res = await chargenOptions("nope");
  assertEquals(res.status, 404);
});

Deno.test("chargenOptions kiths filter", OPTS, async () => {
  const all = await (await chargenOptions("kiths")).json();
  const fairest = await (
    await chargenOptions("kiths", "Fairest")
  ).json();
  assertEquals(all.items.length >= fairest.items.length, true);
  for (const k of fairest.items) {
    assertEquals(
      String(k.seeming).toLowerCase(),
      "fairest",
    );
  }
  assertExists(all.items[0].blessing);
  assertExists(all.items[0].description);
});

Deno.test("chargenOptions seemings enriched", OPTS, async () => {
  const body = await (await chargenOptions("seemings")).json();
  assertEquals(body.ok, true);
  assertEquals(body.items.length >= 6, true);
  const s = body.items[0];
  assertExists(s.name);
  assertExists(s.favoredRegalia);
  assertExists(s.blessing);
  assertExists(s.description);
});

Deno.test("chargenOptions courts and regalia enriched", OPTS, async () => {
  const courts = await (await chargenOptions("courts")).json();
  assertExists(courts.items[0].emotion);
  assertExists(courts.items[0].description);
  const regs = await (await chargenOptions("regalia")).json();
  assertExists(regs.items[0].favoredBy);
  assertExists(regs.items[0].description);
});

Deno.test("chargenOptions merits catalog", OPTS, async () => {
  const res = await chargenOptions("merits");
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.ok, true);
  assertEquals(Array.isArray(body.items), true);
  assertEquals(body.items.length > 50, true);
  const allies = body.items.find((m: { key: string }) => m.key === "allies");
  assertExists(allies);
  assertEquals(Array.isArray(allies.allowedDots), true);
  assertEquals(allies.allowedDots.includes(1), true);
  assertEquals(typeof allies.minCost, "number");
});
