import { assert, assertEquals } from "@std/assert";
import { genWord, syllableCountFor } from "../src/phonemes.ts";
import { mulberry32 } from "../src/rng.ts";
import type { LangDef } from "../src/schema.ts";

const lang: LangDef = {
  schema: 1,
  name: "test",
  mode: "phoneme",
  onsets: ["k", "p", "t"],
  nuclei: ["a", "i", "u"],
  codas: ["k", "n", ""],
  syllablePatterns: ["CV", "CVC"],
  wordLenWeights: [0, 1, 2, 1],
};

Deno.test("syllableCountFor — buckets by word length", () => {
  assertEquals(syllableCountFor(1), 1);
  assertEquals(syllableCountFor(2), 1);
  assertEquals(syllableCountFor(5), 2);
  assertEquals(syllableCountFor(8), 3);
  assertEquals(syllableCountFor(20), 5);
});

Deno.test("genWord — uses only configured phonemes", () => {
  const rng = mulberry32(42);
  const allowed = new Set(
    [...lang.onsets!, ...lang.nuclei!, ...lang.codas!].join(""),
  );
  for (let i = 0; i < 100; i++) {
    const w = genWord(lang, rng);
    assert(w.length > 0, "word must be non-empty");
    for (const ch of w) {
      assert(allowed.has(ch), `unexpected char "${ch}" in "${w}"`);
    }
  }
});

Deno.test("genWord — deterministic for same seed", () => {
  const a = genWord(lang, mulberry32(123), 3);
  const b = genWord(lang, mulberry32(123), 3);
  assertEquals(a, b);
});
