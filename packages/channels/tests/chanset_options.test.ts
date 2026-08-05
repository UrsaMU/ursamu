/**
 * Pure @chanset property parsing.
 */
import { assertEquals } from "@std/assert";
import { buildChansetOptions } from "../src/commands/exec.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("buildChansetOptions: header and lock", OPTS, () => {
  assertEquals(buildChansetOptions("header", "[P]"), {
    header: "[P]",
  });
  assertEquals(buildChansetOptions("lock", "connected"), {
    lock: "connected",
  });
});

Deno.test("buildChansetOptions: on/off flags", OPTS, () => {
  assertEquals(buildChansetOptions("hidden", "on"), {
    hidden: true,
  });
  assertEquals(buildChansetOptions("hidden", "off"), {
    hidden: false,
  });
  assertEquals(buildChansetOptions("masking", "yes"), {
    masking: true,
  });
  assertEquals(buildChansetOptions("log", "on"), {
    logHistory: true,
  });
  assertEquals(buildChansetOptions("announce", "on"), {
    announce: true,
  });
  assertEquals(buildChansetOptions("announce", "off"), {
    announce: false,
  });
});

Deno.test("buildChansetOptions: historyLimit bounds", OPTS, () => {
  assertEquals(buildChansetOptions("historyLimit", "100"), {
    historyLimit: 100,
  });
  assertEquals(
    typeof buildChansetOptions("historyLimit", "0"),
    "string",
  );
  assertEquals(
    typeof buildChansetOptions("historyLimit", "9000"),
    "string",
  );
});

Deno.test("buildChansetOptions: unknown property", OPTS, () => {
  assertEquals(buildChansetOptions("nope", "x"), null);
});
