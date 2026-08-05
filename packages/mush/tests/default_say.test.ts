/**
 * Unmatched bare text defaults to say (not Huh).
 */
import { assertEquals } from "@std/assert";
import { shouldDefaultToSay } from "../src/commands/addCmd.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("shouldDefaultToSay: speech yes", OPTS, () => {
  assertEquals(shouldDefaultToSay("Hello there"), true);
  assertEquals(shouldDefaultToSay("how are you?"), true);
});

Deno.test("shouldDefaultToSay: pose/say shortcuts no", OPTS, () => {
  assertEquals(shouldDefaultToSay(":waves"), false);
  assertEquals(shouldDefaultToSay(";grins"), false);
  assertEquals(shouldDefaultToSay('"Hello"'), false);
  assertEquals(shouldDefaultToSay("'hi"), false);
  assertEquals(shouldDefaultToSay("say hi"), false);
  assertEquals(shouldDefaultToSay("pose dances"), false);
});

Deno.test("shouldDefaultToSay: staff prefixes no", OPTS, () => {
  assertEquals(shouldDefaultToSay("@name me=x"), false);
  assertEquals(shouldDefaultToSay("+who"), false);
  assertEquals(shouldDefaultToSay("/foo"), false);
});

Deno.test("shouldDefaultToSay: empty no", OPTS, () => {
  assertEquals(shouldDefaultToSay(""), false);
  assertEquals(shouldDefaultToSay("   "), false);
});
