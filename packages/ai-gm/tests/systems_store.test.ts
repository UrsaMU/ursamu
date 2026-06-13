import { assertEquals, assertStringIncludes, assertThrows } from "@std/assert";
import {
  deserializeSystem,
  getGameSystem,
  getGameSystemNames,
  registerGameSystem,
} from "../systems/store.ts";
import type { IStoredGameSystem } from "../systems/store.ts";
import { urbanShadowsSystem } from "../systems/urban-shadows.ts";
import { genericSystem } from "../systems/generic.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeStoredSystem(
  overrides: Partial<IStoredGameSystem> = {},
): IStoredGameSystem {
  return {
    id: "test-rpg",
    name: "Test RPG",
    version: "1.0.0",
    source: "ingested",
    ingestedFrom: ["rules.pdf"],
    confidence: {},
    coreRulesPrompt: "Roll 2d6 and add a stat.",
    moveThresholds: { fullSuccess: 10, partialSuccess: 7 },
    stats: ["brawn", "wit", "grit"],
    adjudicationHint: "Fiction first.",
    hardMoves: ["Deal harm", "Separate them"],
    softMoves: ["Foreshadow trouble"],
    missConsequenceHint: "On a miss, make a hard move.",
    categories: ["Combat", "Social"],
    statsByCategory: {
      Combat: ["brawn", "grit"],
      Social: ["wit"],
    },
    ...overrides,
  };
}

// ─── getGameSystem ────────────────────────────────────────────────────────────

Deno.test("getGameSystem: falls back to genericSystem for unknown id", () => {
  const system = getGameSystem("definitely-does-not-exist-xyz");
  assertEquals(system.id, genericSystem.id);
});

Deno.test("getGameSystem: returns urbanShadowsSystem for its own id", () => {
  const system = getGameSystem("urban-shadows");
  assertEquals(system.id, "urban-shadows");
  assertEquals(system.name, "Urban Shadows 2E");
});

Deno.test("getGameSystem: returns registered system by id", () => {
  const custom = deserializeSystem(
    makeStoredSystem({ id: "my-custom-system" }),
  );
  registerGameSystem(custom);
  const retrieved = getGameSystem("my-custom-system");
  assertEquals(retrieved.id, "my-custom-system");
});

// ─── registerGameSystem ───────────────────────────────────────────────────────

Deno.test("registerGameSystem: newly registered system is retrievable", () => {
  const stored = makeStoredSystem({ id: "reg-test-1", name: "Reg Test One" });
  const system = deserializeSystem(stored);
  registerGameSystem(system);
  assertEquals(getGameSystem("reg-test-1").name, "Reg Test One");
});

Deno.test("registerGameSystem: overwriting same id replaces the system", () => {
  const storedV1 = makeStoredSystem({ id: "versioned-sys", name: "Version 1" });
  const storedV2 = makeStoredSystem({ id: "versioned-sys", name: "Version 2" });
  registerGameSystem(deserializeSystem(storedV1));
  registerGameSystem(deserializeSystem(storedV2));
  assertEquals(getGameSystem("versioned-sys").name, "Version 2");
});

Deno.test("registerGameSystem: registered system appears in getGameSystemNames()", () => {
  const stored = makeStoredSystem({ id: "names-test-sys" });
  registerGameSystem(deserializeSystem(stored));
  const names = getGameSystemNames();
  assertEquals(names.includes("names-test-sys"), true);
});

Deno.test("getGameSystemNames: always includes generic as bundled default", () => {
  const names = getGameSystemNames();
  assertEquals(names.includes("generic"), true);
});

// ─── deserializeSystem ────────────────────────────────────────────────────────

Deno.test("deserializeSystem: id is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.id, "test-rpg");
});

Deno.test("deserializeSystem: name is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.name, "Test RPG");
});

Deno.test("deserializeSystem: version is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.version, "1.0.0");
});

Deno.test("deserializeSystem: source is 'ingested'", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.source, "ingested");
});

Deno.test("deserializeSystem: ingestedFrom is preserved", () => {
  const system = deserializeSystem(
    makeStoredSystem({ ingestedFrom: ["a.pdf", "b.pdf"] }),
  );
  assertEquals(system.ingestedFrom, ["a.pdf", "b.pdf"]);
});

Deno.test("deserializeSystem: stats array is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals([...system.stats].sort(), ["brawn", "grit", "wit"]);
});

Deno.test("deserializeSystem: moveThresholds are preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.moveThresholds.fullSuccess, 10);
  assertEquals(system.moveThresholds.partialSuccess, 7);
});

Deno.test("deserializeSystem: coreRulesPrompt is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.coreRulesPrompt, "Roll 2d6 and add a stat.");
});

Deno.test("deserializeSystem: adjudicationHint is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.adjudicationHint, "Fiction first.");
});

Deno.test("deserializeSystem: hardMoves are preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.hardMoves.includes("Deal harm"), true);
  assertEquals(system.hardMoves.includes("Separate them"), true);
});

Deno.test("deserializeSystem: softMoves are preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.softMoves.includes("Foreshadow trouble"), true);
});

Deno.test("deserializeSystem: missConsequenceHint is preserved", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertStringIncludes(system.missConsequenceHint, "hard move");
});

Deno.test("deserializeSystem: getCategories() returns stored categories", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals([...system.getCategories()].sort(), ["Combat", "Social"]);
});

Deno.test("deserializeSystem: getStats() without category returns all stats", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals([...system.getStats()].sort(), ["brawn", "grit", "wit"]);
});

Deno.test("deserializeSystem: getStats(category) returns stats for that category", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals([...system.getStats("Combat")].sort(), ["brawn", "grit"]);
  assertEquals(system.getStats("Social"), ["wit"]);
});

Deno.test("deserializeSystem: getStats(unknown category) returns empty array", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.getStats("Nonexistent"), []);
});

Deno.test("deserializeSystem: getStat reads lowercase key from actor object", () => {
  const system = deserializeSystem(makeStoredSystem());
  const actor: Record<string, unknown> = { brawn: 2 };
  assertEquals(system.getStat(actor, "brawn"), 2);
  assertEquals(system.getStat(actor, "BRAWN"), 2);
});

Deno.test("deserializeSystem: getStat returns 0 for missing stat", () => {
  const system = deserializeSystem(makeStoredSystem());
  const actor: Record<string, unknown> = {};
  assertEquals(system.getStat(actor, "brawn"), 0);
});

Deno.test("deserializeSystem: setStat writes lowercase key to actor object", async () => {
  const system = deserializeSystem(makeStoredSystem());
  const actor: Record<string, unknown> = {};
  await system.setStat(actor, "WIT", 3);
  assertEquals(actor["wit"], 3);
});

Deno.test("deserializeSystem: validate returns true for known stat with numeric value", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.validate("brawn", 2), true);
});

Deno.test("deserializeSystem: validate returns falsy for unknown stat", () => {
  const system = deserializeSystem(makeStoredSystem());
  const result = system.validate("unknown-stat", 2);
  assertEquals(!!result, false);
});

Deno.test("deserializeSystem: validate returns false for non-numeric value", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.validate("brawn", "not-a-number"), false);
});

Deno.test("deserializeSystem: formatMoveResult includes move name and total", () => {
  const system = deserializeSystem(makeStoredSystem());
  const result = system.formatMoveResult("Act Under Pressure", "brawn", 10, [
    5,
    5,
  ]);
  assertStringIncludes(result, "Act Under Pressure");
  assertStringIncludes(result, "10");
});

Deno.test("deserializeSystem: formatMoveResult shows 'Full success' for total >= fullSuccess", () => {
  const system = deserializeSystem(makeStoredSystem());
  const result = system.formatMoveResult("Move A", "brawn", 10, [5, 5]);
  assertStringIncludes(result, "Full success");
});

Deno.test("deserializeSystem: formatMoveResult shows 'Partial success' for total in 7-9", () => {
  const system = deserializeSystem(makeStoredSystem());
  const result = system.formatMoveResult("Move B", "wit", 8, [4, 4]);
  assertStringIncludes(result, "Partial success");
});

Deno.test("deserializeSystem: formatMoveResult shows 'Miss' for total below partialSuccess", () => {
  const system = deserializeSystem(makeStoredSystem());
  const result = system.formatMoveResult("Move C", "grit", 5, [2, 3]);
  assertStringIncludes(result, "Miss");
});

Deno.test("deserializeSystem: formatCharacterContext includes character name", () => {
  const system = deserializeSystem(makeStoredSystem());
  const sheet = {
    id: "c1",
    playerId: "p1",
    name: "Rook",
    status: "approved",
    data: { brawn: 2, wit: 1, grit: 0 },
  };
  const ctx = system.formatCharacterContext(sheet);
  assertStringIncludes(ctx, "Rook");
});

// ─── Security: charCollection Zod validation (Finding 3) ─────────────────────

Deno.test("deserializeSystem: rejects hostile charCollection value via Zod", () => {
  // Pre-patch this would succeed — Zod accepted any string.
  // Post-patch the regex /^[a-z0-9]+(\.[a-z0-9]+)*$/ must reject it.
  assertThrows(
    () =>
      deserializeSystem(
        makeStoredSystem({ charCollection: "../../../etc/passwd" }),
      ),
    Error,
  );
});

Deno.test("deserializeSystem: rejects charCollection with uppercase letters", () => {
  assertThrows(
    () =>
      deserializeSystem(
        makeStoredSystem({ charCollection: "Shadowrun.Chars" }),
      ),
    Error,
  );
});

Deno.test("deserializeSystem: accepts valid charCollection value", () => {
  const system = deserializeSystem(
    makeStoredSystem({ charCollection: "shadowrun.chars" }),
  );
  assertEquals(system.charCollection, "shadowrun.chars");
});

Deno.test("deserializeSystem: charCollection undefined is preserved as undefined", () => {
  const system = deserializeSystem(makeStoredSystem());
  assertEquals(system.charCollection, undefined);
});

// ─────────────────────────────────────────────────────────────────────────────

Deno.test("deserializeSystem: formatCharacterContext includes stat values from data", () => {
  const system = deserializeSystem(makeStoredSystem());
  const sheet = {
    id: "c1",
    playerId: "p1",
    name: "Rook",
    status: "approved",
    data: { brawn: 2, wit: 1, grit: -1 },
  };
  const ctx = system.formatCharacterContext(sheet);
  assertStringIncludes(ctx, "brawn");
  assertStringIncludes(ctx, "2");
});
