import { assert, assertStringIncludes } from "@std/assert";
import { bakeScript, buildGarbleSnippet, buildLangDefsSnippet } from "../src/inline.ts";
import { clearLangs, registerLangForTest } from "../src/langStore.ts";
import type { LangDef } from "../src/schema.ts";

const wookie: LangDef = {
  schema: 1, name: "shyriiwook", mode: "phoneme",
  onsets: ["k"], nuclei: ["a"], codas: [""],
  syllablePatterns: ["CV"], wordLenWeights: [0, 1],
};

Deno.test("buildGarbleSnippet — inlines functions without import/export keywords", async () => {
  const snippet = await buildGarbleSnippet();
  assertStringIncludes(snippet, "function garble(");
  assertStringIncludes(snippet, "function genWord(");
  assertStringIncludes(snippet, "function fnv1a(");
  assert(!/^import\s/m.test(snippet), "no top-level import lines should remain");
  assert(!/^export\s/m.test(snippet), "no top-level export keywords should remain");
});

Deno.test("buildLangDefsSnippet — bakes loaded defs as a JS const", () => {
  clearLangs();
  registerLangForTest(wookie);
  const snippet = buildLangDefsSnippet();
  assertStringIncludes(snippet, "const LANG_DEFS = ");
  assertStringIncludes(snippet, '"shyriiwook"');
});

Deno.test("bakeScript — replaces both template markers", async () => {
  clearLangs();
  registerLangForTest(wookie);
  const baked = await bakeScript(new URL("../scripts/say.ts", import.meta.url).pathname);
  assert(!baked.includes("{{GARBLE_ENGINE}}"), "GARBLE_ENGINE marker should be replaced");
  assert(!baked.includes("{{LANG_DEFS}}"), "LANG_DEFS marker should be replaced");
  assertStringIncludes(baked, "function garble(");
  assertStringIncludes(baked, "const LANG_DEFS = ");
});

Deno.test("bakeScript — produced output includes baked language by name", async () => {
  clearLangs();
  registerLangForTest(wookie);
  const baked = await bakeScript(new URL("../scripts/say.ts", import.meta.url).pathname);
  assertStringIncludes(baked, '"shyriiwook"');
  assertStringIncludes(baked, '"syllablePatterns"');
});
