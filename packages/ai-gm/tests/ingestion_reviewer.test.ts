import { assertEquals, assertStringIncludes } from "@std/assert";
import {
  applyResolution,
  buildOpeningMessage,
  slugify,
} from "../ingestion/reviewer.ts";
import type { IIngestionJob, IUncertainItem } from "../ingestion/schema.ts";

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function makeJob(overrides: Partial<IIngestionJob> = {}): IIngestionJob {
  return {
    id: "job-1",
    files: ["rules.pdf"],
    phase: "reviewing",
    draft: {
      gameName: "Test RPG",
      version: "1.0.0",
      stats: ["brawn", "wit"],
      categories: ["Core"],
      statsByCategory: { Core: ["brawn", "wit"] },
      moveThresholds: { fullSuccess: 10, partialSuccess: 7 },
      hardMoves: ["Deal harm"],
      softMoves: ["Foreshadow trouble"],
      coreRulesPrompt: "Roll 2d6.",
      adjudicationHint: "Fiction first.",
      missConsequenceHint: "Make a hard move.",
      tone: "gritty",
    },
    uncertainItems: [],
    exchanges: [],
    adminIds: ["admin-1"],
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeUncertainItem(
  overrides: Partial<IUncertainItem> = {},
): IUncertainItem {
  return {
    id: "item-1",
    field: "moveThresholds.fullSuccess",
    foundValues: ["10", "9"],
    sources: ["rules.pdf"],
    gmSuggestion: "Use 10 — most common in PbtA.",
    resolved: false,
    ...overrides,
  };
}

// ─── slugify ──────────────────────────────────────────────────────────────────

Deno.test("slugify: lowercases all characters", () => {
  assertEquals(slugify("Urban Shadows"), "urban-shadows");
});

Deno.test("slugify: replaces spaces with hyphens", () => {
  assertEquals(slugify("my game name"), "my-game-name");
});

Deno.test("slugify: collapses multiple spaces into one hyphen", () => {
  assertEquals(slugify("too  many   spaces"), "too-many-spaces");
});

Deno.test("slugify: strips leading and trailing hyphens", () => {
  assertEquals(slugify("  leading and trailing  "), "leading-and-trailing");
});

Deno.test("slugify: removes non-alphanumeric characters", () => {
  assertEquals(slugify("Blades in the Dark!"), "blades-in-the-dark");
});

Deno.test("slugify: handles punctuation and colons", () => {
  assertEquals(
    slugify("Urban Shadows: 2nd Edition"),
    "urban-shadows-2nd-edition",
  );
});

Deno.test("slugify: all digits preserved", () => {
  assertEquals(slugify("System 42"), "system-42");
});

Deno.test("slugify: already-slug string is unchanged", () => {
  assertEquals(slugify("urban-shadows"), "urban-shadows");
});

Deno.test("slugify: empty string produces fallback identifier", () => {
  assertEquals(slugify(""), "unknown");
});

// ─── buildOpeningMessage ──────────────────────────────────────────────────────

Deno.test("buildOpeningMessage: includes game name and version", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "Test RPG");
  assertStringIncludes(msg, "1.0.0");
});

Deno.test("buildOpeningMessage: includes file names", () => {
  const job = makeJob({ files: ["core.pdf", "supplement.pdf"] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "core.pdf");
  assertStringIncludes(msg, "supplement.pdf");
});

Deno.test("buildOpeningMessage: includes stat names", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "brawn");
  assertStringIncludes(msg, "wit");
});

Deno.test("buildOpeningMessage: includes fullSuccess threshold", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "10+");
});

Deno.test("buildOpeningMessage: includes partialSuccess range", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  // partialSuccess(7) to fullSuccess-1(9)
  assertStringIncludes(msg, "7-9");
});

Deno.test("buildOpeningMessage: includes miss threshold", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "below 7");
});

Deno.test("buildOpeningMessage: includes hard/soft move counts", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "1"); // 1 hard move, 1 soft move
});

Deno.test("buildOpeningMessage: includes tone", () => {
  const job = makeJob();
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "gritty");
});

Deno.test("buildOpeningMessage: no uncertain items → shows approve/reject prompt", () => {
  const job = makeJob({ uncertainItems: [] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "approve");
  assertStringIncludes(msg, "reject");
});

Deno.test("buildOpeningMessage: uncertain items → shows review prompt instead", () => {
  const job = makeJob({
    uncertainItems: [makeUncertainItem()],
  });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "review");
  // Should NOT tell them to approve/reject yet
  assertEquals(msg.includes("reject"), false);
});

Deno.test("buildOpeningMessage: lists each uncertain item with its field", () => {
  const item = makeUncertainItem({ field: "moveThresholds.fullSuccess" });
  const job = makeJob({ uncertainItems: [item] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "moveThresholds.fullSuccess");
});

Deno.test("buildOpeningMessage: uncertain item includes found values", () => {
  const item = makeUncertainItem({ foundValues: ["10", "9"] });
  const job = makeJob({ uncertainItems: [item] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "10");
  assertStringIncludes(msg, "9");
});

Deno.test("buildOpeningMessage: uncertain item shows resolve command with job id", () => {
  const item = makeUncertainItem({ id: "item-abc" });
  const job = makeJob({ id: "job-xyz", uncertainItems: [item] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "job-xyz");
  assertStringIncludes(msg, "item-abc");
});

Deno.test("buildOpeningMessage: shows GM recommendation for each uncertain item", () => {
  const item = makeUncertainItem({
    gmSuggestion: "Use 10 — most common in PbtA.",
  });
  const job = makeJob({ uncertainItems: [item] });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "Use 10");
});

Deno.test("buildOpeningMessage: multiple uncertain items are numbered sequentially", () => {
  const items = [
    makeUncertainItem({ id: "i1", field: "moveThresholds.fullSuccess" }),
    makeUncertainItem({ id: "i2", field: "stats" }),
  ];
  const job = makeJob({ uncertainItems: items });
  const msg = buildOpeningMessage(job);
  assertStringIncludes(msg, "[1]");
  assertStringIncludes(msg, "[2]");
});

// ─── applyResolution ──────────────────────────────────────────────────────────

Deno.test("applyResolution: sets moveThresholds.fullSuccess as a number", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "moveThresholds.fullSuccess" });
  applyResolution(job, item, "12");
  assertEquals(job.draft!.moveThresholds.fullSuccess, 12);
});

Deno.test("applyResolution: sets moveThresholds.partialSuccess as a number", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "moveThresholds.partialSuccess" });
  applyResolution(job, item, "8");
  assertEquals(job.draft!.moveThresholds.partialSuccess, 8);
});

Deno.test("applyResolution: sets stats from comma-separated string", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "stats" });
  applyResolution(job, item, "blood, heart, mind, spirit");
  assertEquals([...job.draft!.stats].sort(), [
    "blood",
    "heart",
    "mind",
    "spirit",
  ]);
});

Deno.test("applyResolution: stats are trimmed of whitespace", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "stats" });
  applyResolution(job, item, "  brawn ,  wit  ");
  assertEquals(job.draft!.stats, ["brawn", "wit"]);
});

Deno.test("applyResolution: unknown field sets value on draft as generic key", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "tone" });
  applyResolution(job, item, "lighthearted");
  // deno-lint-ignore no-explicit-any
  assertEquals((job.draft as any).tone, "lighthearted");
});

Deno.test("applyResolution: no-op when job has no draft", () => {
  const job = makeJob({ draft: undefined });
  const item = makeUncertainItem({ field: "moveThresholds.fullSuccess" });
  // Should not throw
  applyResolution(job, item, "10");
  assertEquals(job.draft, undefined);
});

Deno.test("applyResolution: numeric coercion works for string '10'", () => {
  const job = makeJob();
  const item = makeUncertainItem({ field: "moveThresholds.fullSuccess" });
  applyResolution(job, item, "10");
  assertEquals(job.draft!.moveThresholds.fullSuccess, 10);
  assertEquals(typeof job.draft!.moveThresholds.fullSuccess, "number");
});
