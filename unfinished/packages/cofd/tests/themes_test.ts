// Unit tests for theme spawn tables.

import { assert, assertEquals } from "@std/assert";
import {
  pickThemeSpawns,
  type SpawnSize,
  type ThemeKey,
  themeKeys,
  THEMES,
} from "../src/combat/themes.ts";
import { getArchetype } from "../src/npc/archetypes.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("every theme entry references a real archetype", OPTS, () => {
  for (const key of Object.keys(THEMES) as ThemeKey[]) {
    const entries = THEMES[key];
    for (const e of entries) {
      assert(
        getArchetype(e.archetype) !== null && getArchetype(e.archetype) !== undefined,
        `theme '${key}' references unknown archetype '${e.archetype}'`,
      );
    }
  }
});

Deno.test("pickThemeSpawns returns the right size count", OPTS, () => {
  const cases: Array<[SpawnSize, number]> = [
    ["small", 3],
    ["medium", 6],
    ["large", 12],
  ];
  for (const [size, expected] of cases) {
    const picks = pickThemeSpawns("forest", size);
    assertEquals(picks.length, expected, `size '${size}' should yield ${expected} picks`);
  }
});

Deno.test("pickThemeSpawns only emits archetypes from the theme table", OPTS, () => {
  for (const key of themeKeys()) {
    const entries = (THEMES as Record<string, { archetype: string }[]>)[key];
    if (!entries) continue;
    const allowed = new Set(entries.map((e) => e.archetype));
    const picks = pickThemeSpawns(key as ThemeKey, "large");
    for (const p of picks) {
      assert(allowed.has(p.archetype), `theme '${key}' produced out-of-table archetype '${p.archetype}'`);
    }
  }
});
