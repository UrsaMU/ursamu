import { assert, assertEquals } from "@std/assert";
import { clearLangs, getLang, listLangs, loadLanguages } from "../src/langStore.ts";

async function withTempDir(fn: (dir: string) => Promise<void>): Promise<void> {
  const dir = await Deno.makeTempDir({ prefix: "sgp-lang-test-" });
  try { await fn(dir); } finally { await Deno.remove(dir, { recursive: true }); }
}

const GOOD = {
  schema: 1, name: "wookie", mode: "phoneme",
  onsets: ["k"], nuclei: ["a"], codas: [""],
  syllablePatterns: ["CV"], wordLenWeights: [0, 1],
};

Deno.test("loadLanguages — loads valid file", async () => {
  await withTempDir(async (dir) => {
    await Deno.writeTextFile(`${dir}/wookie.json`, JSON.stringify(GOOD));
    clearLangs();
    const r = await loadLanguages(dir);
    assertEquals(r.errors, []);
    assertEquals(r.loaded, ["wookie"]);
    assert(getLang("wookie"));
    assert(getLang("WOOKIE"), "lookup should be case-insensitive");
    assertEquals(listLangs().length, 1);
  });
});

Deno.test("loadLanguages — reports JSON parse errors", async () => {
  await withTempDir(async (dir) => {
    await Deno.writeTextFile(`${dir}/bad.json`, "{ not json");
    clearLangs();
    const r = await loadLanguages(dir);
    assertEquals(r.loaded, []);
    assert(r.errors.length > 0);
    assert(r.errors[0].includes("bad.json"));
  });
});

Deno.test("loadLanguages — reports validation errors with filename", async () => {
  await withTempDir(async (dir) => {
    await Deno.writeTextFile(`${dir}/broken.json`, JSON.stringify({ ...GOOD, nuclei: [] }));
    clearLangs();
    const r = await loadLanguages(dir);
    assertEquals(r.loaded, []);
    assert(r.errors.some((e) => e.includes("broken.json")));
  });
});

Deno.test("loadLanguages — missing directory yields error, not throw", async () => {
  clearLangs();
  const r = await loadLanguages("/tmp/sgp-lang-does-not-exist-12345");
  assertEquals(r.loaded, []);
  assert(r.errors.length === 1);
});

Deno.test("loadLanguages — clears prior state on reload", async () => {
  await withTempDir(async (dir) => {
    await Deno.writeTextFile(`${dir}/wookie.json`, JSON.stringify(GOOD));
    clearLangs();
    await loadLanguages(dir);
    assertEquals(listLangs().length, 1);
    await Deno.remove(`${dir}/wookie.json`);
    await loadLanguages(dir);
    assertEquals(listLangs().length, 0);
  });
});
