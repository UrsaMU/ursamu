// Unit tests for runtime (staff-registered) theme registration.

import { assert, assertEquals } from "@std/assert";
import {
  pickThemeSpawns,
  registerCustomTheme,
  themeKeys,
  type ThemeEntry,
} from "../src/combat/themes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const validEntries: ThemeEntry[] = [
  { archetype: "thug", weight: 5, aggro: "territorial" },
  { archetype: "beast", weight: 2, aggro: "hunter" },
];

Deno.test("registerCustomTheme rejects override of a builtin key", OPTS, () => {
  const r = registerCustomTheme("forest", validEntries);
  assertEquals(r.ok, false);
  assert(r.reason && /builtin/i.test(r.reason));
});

Deno.test("registerCustomTheme rejects malformed keys", OPTS, () => {
  for (const bad of ["", "A", "Has-Caps", "with space", "x", "..", "way-too-long-key-name-that-blows-the-limit-easily"]) {
    const r = registerCustomTheme(bad, validEntries);
    assertEquals(r.ok, false, `expected '${bad}' to be rejected`);
  }
});

Deno.test("registerCustomTheme rejects unknown archetype", OPTS, () => {
  const r = registerCustomTheme("custom-bad-arch", [
    { archetype: "definitely-not-real", weight: 3, aggro: "passive" },
  ]);
  assertEquals(r.ok, false);
  assert(r.reason && /archetype/i.test(r.reason));
});

Deno.test("registerCustomTheme rejects empty entries", OPTS, () => {
  const r = registerCustomTheme("custom-empty", []);
  assertEquals(r.ok, false);
});

Deno.test("registerCustomTheme rejects invalid weight and aggro", OPTS, () => {
  const w = registerCustomTheme("custom-bad-weight", [
    { archetype: "thug", weight: 0, aggro: "passive" },
  ]);
  assertEquals(w.ok, false);
  const a = registerCustomTheme("custom-bad-aggro", [
    { archetype: "thug", weight: 5, aggro: "berserk" as unknown as ThemeEntry["aggro"] },
  ]);
  assertEquals(a.ok, false);
});

Deno.test("registerCustomTheme exposes theme via themeKeys and pickThemeSpawns", OPTS, () => {
  const key = "custom-marsh";
  const r = registerCustomTheme(key, validEntries);
  assertEquals(r.ok, true);

  const keys = themeKeys();
  assert(keys.includes(key), `themeKeys() should include '${key}'`);

  const picks = pickThemeSpawns(key, "small");
  assertEquals(picks.length, 3);
  const allowed = new Set(validEntries.map((e) => e.archetype));
  for (const p of picks) {
    assert(allowed.has(p.archetype), `unexpected archetype '${p.archetype}'`);
  }
});
