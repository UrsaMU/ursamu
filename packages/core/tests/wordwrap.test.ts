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

Deno.test(
  "wordWrap - %r is a line break (pre-formatted multi-line)",
  OPTS,
  () => {
    // Chargen/sheets join with %r. send() wraps BEFORE the telnet
    // formatter expands %r → \n. Without treating %r as a break, the
    // whole block is one line and gets shredded on spaces.
    const step =
      "  [~] Step 2 - Concept           +chargen/set fullName=<name>";
    const block =
      "Breed:   Homid            Auspice: Ahroun           Tribe:   -" +
      "%r" +
      step +
      "%r" +
      "  [ ] Step 3 - Attributes        (locked)";
    const result = wordWrap(block, 78);
    const lines = result.split("\n");
    assertEquals(lines.length, 3);
    assertEquals(lines[1], step);
    assertEquals(
      lines[0],
      "Breed:   Homid            Auspice: Ahroun           Tribe:   -",
    );
  },
);

Deno.test(
  "wordWrap - does not reflow a 78-col step row at width 78",
  OPTS,
  () => {
    const step =
      "  [~] Step 1 - Sub-template      +chargen/set tribe=<tribe>";
    assertEquals(wordWrap(step, 78), step);
  },
);

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
