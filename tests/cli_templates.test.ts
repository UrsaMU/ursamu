/**
 * TDD audit tests for src/cli/create-templates.ts
 *
 * Red phase: each test below proves a defect in the generated scaffold output.
 * These tests must PASS after the corresponding fixes are applied.
 */
import { assertStringIncludes, assertNotMatch } from "@std/assert";

import {
  inTreePluginCommandsTs,
  inTreeCommandFamilyTs,
  inTreePluginSchemasTs,
  inTreePluginIndexTs,
  standaloneShowcaseTs,
  gameClaude,
} from "../src/cli/create-templates.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ─── C1: generated addCmd must include help: field ────────────────────────────

Deno.test("C1 — inTreeCommandFamilyTs: generated addCmd includes help: field", OPTS, () => {
  const out = inTreeCommandFamilyTs("my-feature", "MyFeature");
  assertStringIncludes(out, "help:", "addCmd missing required help: field");
});

// ─── C2: generated exec handler must strip MUSH codes from args ──────────────

Deno.test("C2 — inTreeCommandFamilyTs: generated exec calls stripSubs on args", OPTS, () => {
  const out = inTreeCommandFamilyTs("my-feature", "MyFeature");
  assertStringIncludes(out, "stripSubs", "exec handler does not call u.util.stripSubs() on args");
});

// ─── C4: commands.ts barrel must not contain addCmd logic ─────────────────────

Deno.test("C4 — inTreePluginCommandsTs: barrel contains only imports", OPTS, () => {
  const out = inTreePluginCommandsTs("my-feature");
  // Strip comments, then verify no addCmd( calls remain
  const codeOnly = out.replace(/\/\/[^\n]*/g, "");
  assertNotMatch(codeOnly, /addCmd\(/, "commands.ts barrel should not contain addCmd calls — those belong in commands/<name>.ts");
  assertStringIncludes(out, `import "./commands/my-feature.ts"`, "barrel missing import for command family file");
});

// ─── C3: CLAUDE.md must document the real u.forceAs API ─────────────────────

Deno.test("C3 — gameClaude: does not reference nonexistent u.sdk.forceAs", OPTS, () => {
  const out = gameClaude("TestGame");
  assertNotMatch(out, /u\.sdk\.forceAs/, "gameClaude references nonexistent u.sdk.forceAs");
});

// ─── H2: schemas.ts must not instantiate DBO — types only ────────────────────

Deno.test("H2 — inTreePluginSchemasTs: db/schemas.ts contains no DBO instances", OPTS, () => {
  const out = inTreePluginSchemasTs("my-feature", "MyFeature");
  assertNotMatch(out, /new DBO\(/, "db/schemas.ts should not instantiate DBO — instances belong in command files");
});

// ─── H3: command family must namespace DBO collection under plugin name ───────

Deno.test("H3 — inTreeCommandFamilyTs: DBO example uses <name>. namespace", OPTS, () => {
  const out = inTreeCommandFamilyTs("my-feature", "MyFeature");
  assertStringIncludes(out, `"my-feature.`, "DBO collection example not namespaced under plugin name");
});

// ─── M1: CLAUDE.md must document real SDK methods (no u.db.get / u.db.set) ──

Deno.test("M1 — gameClaude: does not document nonexistent u.db.get", OPTS, () => {
  const out = gameClaude("TestGame");
  assertNotMatch(out, /u\.db\.get\b/, "gameClaude documents nonexistent u.db.get");
});

Deno.test("M1 — gameClaude: does not document nonexistent u.db.set", OPTS, () => {
  const out = gameClaude("TestGame");
  assertNotMatch(out, /u\.db\.set\b/, "gameClaude documents nonexistent u.db.set");
});

// ─── M2: remove() should not be async ────────────────────────────────────────

Deno.test("M2 — inTreePluginIndexTs: remove() is not async", OPTS, () => {
  const out = inTreePluginIndexTs("my-feature", "myFeatureHandler", "myFeature");
  assertNotMatch(out, /async remove\(\)/, "remove() is unnecessarily async");
});

// ─── C1-fix: standaloneShowcaseTs must not reference invalid sub-path export ──

Deno.test("C1-fix — standaloneShowcaseTs: does not import jsr:@ursamu/ursamu/cmdParser", OPTS, () => {
  const out = standaloneShowcaseTs();
  assertNotMatch(
    out,
    /jsr:@ursamu\/ursamu\/cmdParser/,
    "standaloneShowcaseTs must not import the invalid /cmdParser sub-path — use main entry or alternative approach",
  );
  assertStringIncludes(out, "cmds", "standaloneShowcaseTs must still reference cmds registry");
});
