/**
 * Myrddin gap-fill commands: formatting helpers and version.
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { BBS_VERSION, BBS_CODENAME } from "../src/version.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("BBS_VERSION is semver-like", OPTS, () => {
  assertEquals(/^\d+\.\d+\.\d+$/.test(BBS_VERSION), true);
});

Deno.test("BBS_CODENAME mentions Myrddin", OPTS, () => {
  assertStringIncludes(BBS_CODENAME.toLowerCase(), "myrddin");
});

Deno.test("compat module registers expected command names", OPTS, async () => {
  // Side-effect import registers addCmds on whatever mush instance
  // the test graph loads.
  const { cmds } = await import("@ursamu/mush");
  await import("../src/commands/compat.ts");
  const names = new Set(cmds.map((c) => c.name));
  for (const n of [
    "+bbnew",
    "+bbscan",
    "+bbversion",
    "+bbhelp",
    "+bbcolors",
    "+bbanon",
  ]) {
    assertEquals(names.has(n), true, `missing ${n}`);
  }
});
