import { assert, assertEquals } from "@std/assert";
import { validateLangDef } from "../src/schema.ts";

Deno.test("validateLangDef — accepts well-formed phoneme def", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "phoneme",
    onsets: ["k"],
    nuclei: ["a"],
    codas: [""],
    syllablePatterns: ["CV", "CVC"],
    wordLenWeights: [0, 1, 2],
  };
  const r = validateLangDef(def, "x.json");
  assertEquals(r.errors, []);
  assert(r.ok);
});

Deno.test("validateLangDef — accepts well-formed markov def", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "markov",
    markovCorpus: ["hello", "world"],
    markovOrder: 2,
  };
  const r = validateLangDef(def, "x.json");
  assertEquals(r.errors, []);
  assert(r.ok);
});

Deno.test("validateLangDef — rejects empty markovCorpus", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "markov",
    markovCorpus: [],
  };
  const r = validateLangDef(def, "x.json");
  assert(!r.ok);
});

Deno.test("validateLangDef — rejects empty nuclei", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "phoneme",
    onsets: ["k"],
    nuclei: [],
    codas: [""],
    syllablePatterns: ["V"],
    wordLenWeights: [1],
  };
  assert(!validateLangDef(def, "x").ok);
});

Deno.test("validateLangDef — rejects invalid pattern chars", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "phoneme",
    onsets: ["k"],
    nuclei: ["a"],
    codas: [""],
    syllablePatterns: ["CVX"],
    wordLenWeights: [1],
  };
  assert(!validateLangDef(def, "x").ok);
});

Deno.test("validateLangDef — rejects all-zero weights", () => {
  const def = {
    schema: 1,
    name: "x",
    mode: "phoneme",
    onsets: ["k"],
    nuclei: ["a"],
    codas: [""],
    syllablePatterns: ["CV"],
    wordLenWeights: [0, 0, 0],
  };
  assert(!validateLangDef(def, "x").ok);
});

Deno.test("validateLangDef — rejects non-object", () => {
  assert(!validateLangDef("nope", "x").ok);
  assert(!validateLangDef(null, "x").ok);
});
