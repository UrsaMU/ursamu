import { assertEquals, assertMatch } from "@std/assert";
import {
  parseColor,
  sampleGradient,
  gradientText,
  splitColors,
  type Rgb,
} from "../src/verbs/gradient-colors.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseColor: hex forms", OPTS, () => {
  assertEquals(parseColor("#ff0000"), [255, 0, 0]);
  assertEquals(parseColor("00ff00"), [0, 255, 0]);
  assertEquals(parseColor("#f0a"), [255, 0, 170]);
  assertEquals(parseColor("#F00"), [255, 0, 0]);
});

Deno.test("parseColor: named and mush letters", OPTS, () => {
  assertEquals(parseColor("red"), [255, 0, 0]);
  assertEquals(parseColor("CYAN"), [0, 220, 255]);
  assertEquals(parseColor("r"), [255, 0, 0]);
  assertEquals(parseColor("gold"), [255, 200, 40]);
});

Deno.test("parseColor: rejects junk", OPTS, () => {
  assertEquals(parseColor(""), null);
  assertEquals(parseColor("nope"), null);
  assertEquals(parseColor("#gg0000"), null);
  assertEquals(parseColor("#12"), null);
});

Deno.test("sampleGradient: endpoints and mid", OPTS, () => {
  const stops: Rgb[] = [[0, 0, 0], [255, 0, 0]];
  assertEquals(sampleGradient(stops, 0), [0, 0, 0]);
  assertEquals(sampleGradient(stops, 1), [255, 0, 0]);
  assertEquals(sampleGradient(stops, 0.5), [128, 0, 0]);
});

Deno.test("sampleGradient: three stops", OPTS, () => {
  const stops: Rgb[] = [[255, 0, 0], [0, 255, 0], [0, 0, 255]];
  assertEquals(sampleGradient(stops, 0), [255, 0, 0]);
  assertEquals(sampleGradient(stops, 0.5), [0, 255, 0]);
  assertEquals(sampleGradient(stops, 1), [0, 0, 255]);
});

Deno.test("gradientText: wraps each char and resets", OPTS, () => {
  const out = gradientText("AB", [[255, 0, 0], [0, 0, 255]]);
  assertMatch(out, /^<#ff0000>A<#0000ff>B%cn$/);
});

Deno.test("gradientText: single char uses first stop", OPTS, () => {
  const out = gradientText("X", [[10, 20, 30], [200, 200, 200]]);
  assertEquals(out, "<#0a141e>X%cn");
});

Deno.test("splitColors: commas and trim", OPTS, () => {
  assertEquals(splitColors("red, blue, #0f0"), [
    "red",
    "blue",
    "#0f0",
  ]);
  assertEquals(splitColors("  a ,, b  "), ["a", "b"]);
});
