import { assertEquals } from "@std/assert";
import {
  shouldWordWrap,
  wordWrap,
} from "../src/broadcast/send.ts";
import { sessions } from "../src/session/store.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("wordWrap - preserves line length with ANSI escape sequences", OPTS, () => {
  const line = "\x1b[31m=====\x1b[0m \x1b[1m\x1b[33mThe Void(#1)\x1b[0m \x1b[31m===========================================================\x1b[0m";
  // The visible length of this line is 5 + 1 + 12 + 1 + 59 = 78 characters.
  // With ANSI escape codes, it is 109 characters.
  // When width is 78, it should not wrap because visible length <= 78.
  const result = wordWrap(line, 78);
  assertEquals(result, line);
});

Deno.test("wordWrap - preserves line length with hex colors", OPTS, () => {
  const line = "<#ff0000>=====<#000000> <#ffffff>The Void(#1)<#000000> <#ff0000>===========================================================<#000000>";
  const result = wordWrap(line, 78);
  assertEquals(result, line);
});

Deno.test("shouldWordWrap: web skips, telnet wraps", OPTS, () => {
  sessions.open("sock-web", "s1");
  sessions.open("sock-tn", "s2");
  const w = sessions.get("sock-web");
  const t = sessions.get("sock-tn");
  if (w) w.meta.clientType = "web";
  if (t) t.meta.clientType = "telnet";
  assertEquals(shouldWordWrap("sock-web"), false);
  assertEquals(shouldWordWrap("sock-tn"), true);
  assertEquals(shouldWordWrap("missing"), true);
  sessions.close("sock-web");
  sessions.close("sock-tn");
});
