/**
 * tests/pipeline_stages.test.ts
 *
 * Unit tests for the pure helper functions in pipeline-stages.ts.
 * Stage functions that require DB/sandbox are covered by the existing
 * integration tests (cmdparser.test.ts, scripts_*.test.ts).
 */
import { assertEquals } from "@std/assert";
import { parseIntent, resolveScriptName } from "../src/services/commands/dispatch-helpers.ts";

// ---------------------------------------------------------------------------
// parseIntent
// ---------------------------------------------------------------------------

Deno.test("parseIntent — extracts intentName as lowercase first token", () => {
  const { intentName } = parseIntent("LOOK here", "p1");
  assertEquals(intentName, "look");
});

Deno.test("parseIntent — args are remaining tokens", () => {
  const { intent } = parseIntent("say Hello world", "p1");
  assertEquals(intent.args, ["Hello", "world"]);
});

Deno.test("parseIntent — actorId is passed through", () => {
  const { intent } = parseIntent("look", "actor42");
  assertEquals(intent.actorId, "actor42");
});

Deno.test("parseIntent — unknown actorId defaults to 'unknown'", () => {
  const { intent } = parseIntent("look", undefined);
  assertEquals(intent.actorId, "unknown");
});

Deno.test("parseIntent — single token with no args", () => {
  const { intentName, intent } = parseIntent("inventory", "p1");
  assertEquals(intentName, "inventory");
  assertEquals(intent.args, []);
});

// ---------------------------------------------------------------------------
// resolveScriptName — prefix shortcuts
// ---------------------------------------------------------------------------

Deno.test("resolveScriptName — colon prefix maps to pose", () => {
  const { intentName, intent } = parseIntent(":waves", "p1");
  const { scriptName, usedPrefix, scriptArgs } = resolveScriptName(":waves", intentName, intent, {});
  assertEquals(scriptName, "pose");
  assertEquals(usedPrefix, ":");
  assertEquals(scriptArgs, ["waves"]);
});

Deno.test("resolveScriptName — semicolon prefix maps to pose", () => {
  const { intentName, intent } = parseIntent(";waves", "p1");
  const { scriptName, usedPrefix } = resolveScriptName(";waves", intentName, intent, {});
  assertEquals(scriptName, "pose");
  assertEquals(usedPrefix, ";");
});

Deno.test('resolveScriptName — double-quote prefix maps to say', () => {
  const { intentName, intent } = parseIntent('"Hello', "p1");
  const { scriptName, usedPrefix } = resolveScriptName('"Hello', intentName, intent, {});
  assertEquals(scriptName, "say");
  assertEquals(usedPrefix, '"');
});

Deno.test("resolveScriptName — single-quote prefix maps to say", () => {
  const { intentName, intent } = parseIntent("'Hello", "p1");
  const { scriptName, usedPrefix } = resolveScriptName("'Hello", intentName, intent, {});
  assertEquals(scriptName, "say");
  assertEquals(usedPrefix, "'");
});

Deno.test("resolveScriptName — ampersand prefix maps to setattr", () => {
  const { intentName, intent } = parseIntent("&ATTR=val", "p1");
  const { scriptName, usedPrefix } = resolveScriptName("&ATTR=val", intentName, intent, {});
  assertEquals(scriptName, "setattr");
  assertEquals(usedPrefix, "&");
});

// ---------------------------------------------------------------------------
// resolveScriptName — @ and + sigil stripping
// ---------------------------------------------------------------------------

Deno.test("resolveScriptName — @dig strips to 'dig'", () => {
  const { intentName, intent } = parseIntent("@dig", "p1");
  const { scriptName } = resolveScriptName("@dig", intentName, intent, {});
  assertEquals(scriptName, "dig");
});

Deno.test("resolveScriptName — +finger strips to 'finger'", () => {
  const { intentName, intent } = parseIntent("+finger alice", "p1");
  const { scriptName } = resolveScriptName("+finger alice", intentName, intent, {});
  assertEquals(scriptName, "finger");
});

// ---------------------------------------------------------------------------
// resolveScriptName — alias resolution
// ---------------------------------------------------------------------------

Deno.test("resolveScriptName — alias replaces script name", () => {
  const aliases = { tel: "teleport" };
  const { intentName, intent } = parseIntent("@tel #5", "p1");
  const { scriptName } = resolveScriptName("@tel #5", intentName, intent, aliases);
  assertEquals(scriptName, "teleport");
});

Deno.test("resolveScriptName — unknown name with no alias passes through", () => {
  const { intentName, intent } = parseIntent("@unknown", "p1");
  const { scriptName } = resolveScriptName("@unknown", intentName, intent, {});
  assertEquals(scriptName, "unknown");
});

// ---------------------------------------------------------------------------
// resolveScriptName — /switch extraction
// ---------------------------------------------------------------------------

Deno.test("resolveScriptName — @dig/teleport extracts switch", () => {
  const { intentName, intent } = parseIntent("@dig/teleport North", "p1");
  const { scriptName, cmdSwitches } = resolveScriptName("@dig/teleport North", intentName, intent, {});
  assertEquals(scriptName, "dig");
  assertEquals(cmdSwitches, ["teleport"]);
});

Deno.test("resolveScriptName — multiple switches extracted", () => {
  const { intentName, intent } = parseIntent("@open/lock/safe North", "p1");
  const { scriptName, cmdSwitches } = resolveScriptName("@open/lock/safe North", intentName, intent, {});
  assertEquals(scriptName, "open");
  assertEquals(cmdSwitches, ["lock", "safe"]);
});

Deno.test("resolveScriptName — no switch gives empty array", () => {
  const { intentName, intent } = parseIntent("@open North", "p1");
  const { cmdSwitches } = resolveScriptName("@open North", intentName, intent, {});
  assertEquals(cmdSwitches, []);
});

// ---------------------------------------------------------------------------
// resolveScriptName — prefix takes priority over @/+ sigils
// ---------------------------------------------------------------------------

Deno.test("resolveScriptName — prefix beats @ sigil in matching", () => {
  // A message that starts with ':' should map to pose, not try to strip '@'
  const { intentName, intent } = parseIntent(":dances", "p1");
  const { scriptName, usedPrefix } = resolveScriptName(":dances", intentName, intent, {});
  assertEquals(scriptName, "pose");
  assertEquals(usedPrefix, ":");
});
