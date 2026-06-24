import { assertEquals, assertNotEquals, assert } from "@std/assert";
import { garble, tierFor } from "../src/garble.ts";
import type { LangDef } from "../src/schema.ts";

const wookie: LangDef = {
  schema: 1,
  name: "shyriiwook",
  mode: "phoneme",
  onsets: ["k", "g", "rr", "wr"],
  nuclei: ["aa", "uu", "oo"],
  codas: ["k", "rr", ""],
  syllablePatterns: ["CV", "CVC"],
  wordLenWeights: [0, 1, 2, 1],
  capitalize: "first",
};

Deno.test("tierFor — buckets at boundaries", () => {
  assertEquals(tierFor(0).bucket, 0);
  assertEquals(tierFor(1).bucket, 1);
  assertEquals(tierFor(25).bucket, 1);
  assertEquals(tierFor(26).bucket, 2);
  assertEquals(tierFor(60).bucket, 2);
  assertEquals(tierFor(61).bucket, 3);
  assertEquals(tierFor(90).bucket, 3);
  assertEquals(tierFor(91).bucket, 4);
  assertEquals(tierFor(100).bucket, 4);
});

Deno.test("garble — skill 100 is identity", () => {
  const msg = "Hello, friend. How are you today?";
  assertEquals(garble(msg, wookie, 100), msg);
});

Deno.test("garble — deterministic for same inputs", () => {
  const a = garble("Hello there friend", wookie, 30);
  const b = garble("Hello there friend", wookie, 30);
  assertEquals(a, b);
});

Deno.test("garble — different skill produces different output", () => {
  const a = garble("Hello there friend", wookie, 30);
  const b = garble("Hello there friend", wookie, 70);
  assertNotEquals(a, b);
});

Deno.test("garble — punctuation and whitespace preserved", () => {
  const msg = "Hello, world! How... are you?";
  const out = garble(msg, wookie, 0);
  const origPunct = msg.match(/[^A-Za-z']+/g)!.join("");
  const outPunct  = out.match(/[^A-Za-z']+/g)!.join("");
  assertEquals(outPunct, origPunct);
});

Deno.test("garble — word count preserved", () => {
  const msg = "one two three four five six seven";
  const out = garble(msg, wookie, 10);
  const origWords = msg.match(/[A-Za-z']+/g)!.length;
  const outWords  = out.match(/[A-Za-z']+/g)!.length;
  assertEquals(outWords, origWords);
});

Deno.test("garble — skill 0 yields no original words", () => {
  const msg = "the quick brown fox jumps";
  const out = garble(msg, wookie, 0).toLowerCase();
  for (const word of msg.split(/\s+/)) {
    assert(!out.includes(word), `unexpected original word "${word}" in "${out}"`);
  }
});

Deno.test("garble — capitalization preserved for first-cap words", () => {
  const out = garble("Hello there", wookie, 10);
  const first = out.split(/\s+/)[0];
  assertEquals(first[0], first[0].toUpperCase());
});

Deno.test("garble — same word garbles identically across calls (cross-message determinism)", () => {
  const a = garble("hello there", wookie, 30);
  const b = garble("hello friend", wookie, 30);
  const aFirst = a.split(/\s+/)[0];
  const bFirst = b.split(/\s+/)[0];
  assertEquals(aFirst, bFirst, "same word should produce same fake at same tier");
});
