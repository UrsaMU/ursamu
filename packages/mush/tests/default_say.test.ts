/**
 * Unmatched bare text defaults to say (not Huh).
 */
import { assertEquals } from "@std/assert";
import {
  isRegisteredCmdVerb,
  shouldDefaultToSay,
} from "../src/commands/addCmd.ts";
import type { ICmd } from "../src/commands/types.ts";

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

Deno.test("isRegisteredCmdVerb blocks speech rewrite", OPTS, () => {
  const cmds = [
    { name: "wield", pattern: /^wield/i },
    { name: "+wear", pattern: /^\+wear/i },
  ] as ICmd[];
  assertEquals(isRegisteredCmdVerb("wield #1", cmds), true);
  assertEquals(isRegisteredCmdVerb("Wield gun", cmds), true);
  assertEquals(isRegisteredCmdVerb("+wear vest", cmds), true);
  assertEquals(isRegisteredCmdVerb("wear vest", cmds), true);
  assertEquals(isRegisteredCmdVerb("hello there", cmds), false);
  assertEquals(isRegisteredCmdVerb("say wield", cmds), false);
});
