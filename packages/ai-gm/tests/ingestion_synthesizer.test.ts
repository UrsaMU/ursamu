import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  findConflicts,
  mergeExtractions,
  mostCommon,
} from "../ingestion/synthesizer.ts";
import type { IChunkExtraction } from "../ingestion/schema.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeExtraction(
  overrides: Partial<IChunkExtraction> = {},
): IChunkExtraction {
  return {
    chunkIndex: 0,
    sourceFile: "rules.txt",
    confidence: "high",
    ...overrides,
  };
}

// ─── mostCommon ───────────────────────────────────────────────────────────────

Deno.test("mostCommon: returns undefined for empty array", () => {
  assertEquals(mostCommon([]), undefined);
});

Deno.test("mostCommon: single-element array returns that element", () => {
  assertEquals(mostCommon([42]), 42);
});

Deno.test("mostCommon: returns the element that appears most often", () => {
  assertEquals(mostCommon([1, 2, 2, 3]), 2);
});

Deno.test("mostCommon: works with strings", () => {
  assertEquals(mostCommon(["a", "b", "a", "c", "a"]), "a");
});

Deno.test("mostCommon: all equal — returns first", () => {
  const result = mostCommon([10, 10, 10]);
  assertEquals(result, 10);
});

Deno.test("mostCommon: numbers — picks clear majority", () => {
  assertEquals(mostCommon([7, 7, 10, 10, 10]), 10);
});

Deno.test("mostCommon: single string element", () => {
  assertEquals(mostCommon(["Urban Shadows"]), "Urban Shadows");
});

// ─── mergeExtractions ─────────────────────────────────────────────────────────

Deno.test("mergeExtractions: empty array produces empty merged data", () => {
  const merged = mergeExtractions([]);
  assertEquals(merged.gameName, undefined);
  assertEquals(merged.stats, []);
  assertEquals(merged.categories, []);
  assertEquals(merged.hardMoves, []);
  assertEquals(merged.softMoves, []);
});

Deno.test("mergeExtractions: gameName is the most common across extractions", () => {
  const extractions = [
    makeExtraction({ gameName: "Urban Shadows" }),
    makeExtraction({ gameName: "Urban Shadows" }),
    makeExtraction({ gameName: "City of Night" }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.gameName, "Urban Shadows");
});

Deno.test("mergeExtractions: stats are deduplicated across extractions", () => {
  const extractions = [
    makeExtraction({ stats: ["blood", "heart"] }),
    makeExtraction({ stats: ["heart", "mind"] }),
    makeExtraction({ stats: ["blood", "spirit"] }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals([...merged.stats].sort(), ["blood", "heart", "mind", "spirit"]);
});

Deno.test("mergeExtractions: no duplicate stats even if same value appears many times", () => {
  const extractions = [
    makeExtraction({ stats: ["strength"] }),
    makeExtraction({ stats: ["strength"] }),
    makeExtraction({ stats: ["strength"] }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.stats, ["strength"]);
});

Deno.test("mergeExtractions: categories are deduplicated", () => {
  const extractions = [
    makeExtraction({ categories: ["Core", "Advanced"] }),
    makeExtraction({ categories: ["Core"] }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals([...merged.categories].sort(), ["Advanced", "Core"]);
});

Deno.test("mergeExtractions: fullSuccess threshold is picked by majority vote", () => {
  const extractions = [
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 9, partialSuccess: 6 } }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.moveThresholds?.fullSuccess, 10);
});

Deno.test("mergeExtractions: partialSuccess threshold is picked by majority vote", () => {
  const extractions = [
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 6 } }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.moveThresholds?.partialSuccess, 7);
});

Deno.test("mergeExtractions: moveThresholds are undefined when no extractions provide them", () => {
  const extractions = [makeExtraction(), makeExtraction()];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.moveThresholds?.fullSuccess, undefined);
  assertEquals(merged.moveThresholds?.partialSuccess, undefined);
});

Deno.test("mergeExtractions: hardMoves are deduplicated and capped at 20", () => {
  // Provide 25 unique hard moves across extractions
  const movesA = Array.from({ length: 15 }, (_, i) => `Hard move ${i}`);
  const movesB = Array.from({ length: 10 }, (_, i) => `Hard move ${i + 15}`);
  const extractions = [
    makeExtraction({ hardMoves: movesA }),
    makeExtraction({ hardMoves: movesB }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.hardMoves.length, 20);
});

Deno.test("mergeExtractions: softMoves are deduplicated and capped at 12", () => {
  const moves = Array.from({ length: 20 }, (_, i) => `Soft move ${i}`);
  const extractions = [makeExtraction({ softMoves: moves })];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.softMoves.length, 12);
});

Deno.test("mergeExtractions: statsByCategory unions all extractions", () => {
  const extractions = [
    makeExtraction({ statsByCategory: { Combat: ["strength", "agility"] } }),
    makeExtraction({
      statsByCategory: { Combat: ["agility", "toughness"], Social: ["charm"] },
    }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals([...merged.statsByCategory["Combat"]].sort(), [
    "agility",
    "strength",
    "toughness",
  ]);
  assertEquals(merged.statsByCategory["Social"], ["charm"]);
});

Deno.test("mergeExtractions: tone picks first found value", () => {
  const extractions = [
    makeExtraction({ tone: "gritty noir" }),
    makeExtraction({ tone: "high fantasy" }),
  ];
  const merged = mergeExtractions(extractions);
  assertEquals(merged.tone, "gritty noir");
});

Deno.test("mergeExtractions: tone is undefined when no extractions have one", () => {
  const merged = mergeExtractions([makeExtraction(), makeExtraction()]);
  assertEquals(merged.tone, undefined);
});

// ─── findConflicts ────────────────────────────────────────────────────────────

Deno.test("findConflicts: no conflicts when all thresholds agree", () => {
  const extractions = [
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const thresholdConflict = conflicts.find(
    (c) => c.field === "moveThresholds.fullSuccess",
  );
  assertEquals(thresholdConflict, undefined);
});

Deno.test("findConflicts: conflicting fullSuccess values produce an uncertain item", () => {
  const extractions = [
    makeExtraction({
      sourceFile: "book-a.txt",
      moveThresholds: { fullSuccess: 10, partialSuccess: 7 },
    }),
    makeExtraction({
      sourceFile: "book-b.txt",
      moveThresholds: { fullSuccess: 9, partialSuccess: 7 },
    }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const item = conflicts.find((c) => c.field === "moveThresholds.fullSuccess");
  assertEquals(item !== undefined, true);
  assertEquals(item!.resolved, false);
  assertEquals(item!.foundValues.includes("10"), true);
  assertEquals(item!.foundValues.includes("9"), true);
});

Deno.test("findConflicts: conflict item includes source file names", () => {
  const extractions = [
    makeExtraction({
      sourceFile: "book-a.txt",
      moveThresholds: { fullSuccess: 10, partialSuccess: 7 },
    }),
    makeExtraction({
      sourceFile: "book-b.txt",
      moveThresholds: { fullSuccess: 8, partialSuccess: 6 },
    }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const item = conflicts.find((c) => c.field === "moveThresholds.fullSuccess");
  assertStringIncludes(item!.sources.join(","), "book-a.txt");
  assertStringIncludes(item!.sources.join(","), "book-b.txt");
});

Deno.test("findConflicts: conflict item has a gmSuggestion string", () => {
  const extractions = [
    makeExtraction({ moveThresholds: { fullSuccess: 10, partialSuccess: 7 } }),
    makeExtraction({ moveThresholds: { fullSuccess: 12, partialSuccess: 7 } }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const item = conflicts.find((c) => c.field === "moveThresholds.fullSuccess");
  assertEquals(typeof item!.gmSuggestion, "string");
  assertEquals(item!.gmSuggestion.length > 0, true);
});

Deno.test("findConflicts: uncertain stats with no high-confidence backup produce a stats item", () => {
  const extractions = [
    makeExtraction({
      confidence: "uncertain",
      stats: ["blood", "heart"],
      sourceFile: "fuzzy.txt",
    }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const statsItem = conflicts.find((c) => c.field === "stats");
  assertEquals(statsItem !== undefined, true);
  assertEquals(statsItem!.resolved, false);
});

Deno.test("findConflicts: uncertain stats suppressed when high-confidence extraction exists", () => {
  const extractions = [
    makeExtraction({ confidence: "uncertain", stats: ["blood"] }),
    makeExtraction({
      confidence: "high",
      stats: ["blood", "heart", "mind", "spirit"],
    }),
  ];
  const merged = mergeExtractions(extractions);
  const conflicts = findConflicts(extractions, merged);
  const statsItem = conflicts.find((c) => c.field === "stats");
  assertEquals(statsItem, undefined);
});

Deno.test("findConflicts: no conflicts for empty extractions list", () => {
  const conflicts = findConflicts([], {
    stats: [],
    categories: [],
    statsByCategory: {},
    hardMoves: [],
    softMoves: [],
  });
  assertEquals(conflicts.length, 0);
});
