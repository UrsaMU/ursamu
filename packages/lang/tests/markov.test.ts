import { assert, assertEquals } from "@std/assert";
import { genWordMarkov } from "../src/markov.ts";
import { mulberry32 } from "../src/rng.ts";

Deno.test("genWordMarkov — generates word from corpus", () => {
  const corpus = ["dwarf", "mountain", "stone"];
  const rng = mulberry32(12345);
  const word = genWordMarkov(corpus, 2, rng);
  assert(word.length > 0);
});

Deno.test("genWordMarkov — handles empty/invalid gracefully", () => {
  const rng = mulberry32(12345);
  const word = genWordMarkov([], 2, rng);
  assertEquals(word, "garble");
});

Deno.test("genWordMarkov — respects approxLen when possible", () => {
  const corpus = ["durin", "erebor", "khazadum"];
  const rng = mulberry32(12345);
  const word = genWordMarkov(corpus, 2, rng, 6);
  assert(word.length >= 4 && word.length <= 10);
});
