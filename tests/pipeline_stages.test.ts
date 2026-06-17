/**
 * tests/pipeline_stages.test.ts
 *
 * Unit tests for the pure helper functions in pipeline-stages.ts.
 * Stage functions that require DB/sandbox are covered by the existing
 * integration tests (cmdparser.test.ts, scripts_*.test.ts).
 */
import { assertEquals } from "@std/assert";
import { parseIntent } from "../packages/mush/src/commands/pipeline-stages.ts";

// ---------------------------------------------------------------------------
// parseIntent
// ---------------------------------------------------------------------------

Deno.test("parseIntent — extracts intentName as lowercase first token", () => {
  const { intentName } = parseIntent("LOOK here", "p1");
  assertEquals(intentName, "look");
});

Deno.test("parseIntent — args are remaining tokens", () => {
  const { intent } = parseIntent("say Hello world", "p1");
  assertEquals(intent.args, ["Hello world"]);
});

Deno.test("parseIntent — actorId is passed through", () => {
  const { intent } = parseIntent("look", "actor42");
  assertEquals(intent.name, "look");
});

Deno.test("parseIntent — single token with no args", () => {
  const { intentName, intent } = parseIntent("inventory", "p1");
  assertEquals(intentName, "inventory");
  assertEquals(intent.args, []);
});

