/**
 * tests/softcode_caret_patterns.test.ts
 *
 * Unit tests for ^-pattern listener dispatch (MONITOR-flagged objects).
 */
import { assertEquals } from "@std/assert";
import { findCaretMatches } from "../src/utils/caretPatterns.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

function makeObj(
  id: string,
  location: string,
  flags: string,
  attrs: Array<{ name: string; value: string }>,
): IDBOBJ {
  return {
    id,
    location,
    flags,
    data: { attributes: attrs },
    dbobj: {},
  } as unknown as IDBOBJ;
}

function makeDB(objs: IDBOBJ[]) {
  return {
    query: async (q: unknown) => {
      const locVal = (q as { location?: string }).location;
      return objs.filter(o => o.location === locVal);
    },
  };
}

Deno.test("findCaretMatches: returns empty when no MONITOR objects in room", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const npc     = makeObj("npc1", "room1", "object", [
    { name: "^hello *", value: "say Hi back!" },
  ]);
  const db = makeDB([speaker, npc]);

  const hits = await findCaretMatches("room1", "Alice says, \"hello world\"", "s1", db);
  assertEquals(hits.length, 0); // npc1 missing monitor flag
});

Deno.test("findCaretMatches: matches MONITOR object with ^-pattern", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^* says, \"hello *\"", value: "say Greetings, %0!" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "Alice says, \"hello world\"", "s1", db);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].obj.id, "bot1");
  assertEquals(hits[0].captures, ["Alice", "world"]);
  assertEquals(hits[0].attrValue, "say Greetings, %0!");
});

Deno.test("findCaretMatches: speaker excluded from results", async () => {
  const speaker = makeObj("s1", "room1", "player connected monitor", [
    { name: "^*", value: "say I heard something!" },
  ]);
  const db = makeDB([speaker]);

  const hits = await findCaretMatches("room1", "anything", "s1", db);
  assertEquals(hits.length, 0);
});

Deno.test("findCaretMatches: multiple ^-attrs on same object, all matching", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^* says, \"*\"", value: "say heard speech" },
    { name: "^*",             value: "say heard anything" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "Alice says, \"hello\"", "s1", db);
  assertEquals(hits.length, 2);
});

Deno.test("findCaretMatches: only matching ^-attrs returned", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^* says, \"hello *\"", value: "say greet action" },
    { name: "^* says, \"bye *\"",   value: "say farewell action" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", 'Alice says, "hello world"', "s1", db);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].attrValue, "say greet action");
});

Deno.test("findCaretMatches: non-^-attrs are skipped", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "DESC",   value: "A listening bot." },
    { name: "^*",     value: "say I heard you!" },
    { name: "AHEAR",  value: "say heard via AHEAR" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "anything", "s1", db);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].attrName, "^*");
});

Deno.test("findCaretMatches: slash switch stripped from ^-attr name", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^hello */noeval", value: "say match!" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "hello world", "s1", db);
  assertEquals(hits.length, 1);
  assertEquals(hits[0].captures, ["world"]);
});

Deno.test("findCaretMatches: case-insensitive pattern matching", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^HELLO *", value: "say hi!" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "hello world", "s1", db);
  assertEquals(hits.length, 1);
});

Deno.test("findCaretMatches: multiple MONITOR objects, all checked", async () => {
  const speaker = makeObj("s1",    "room1", "player connected", []);
  const bot1    = makeObj("bot1",  "room1", "object monitor", [{ name: "^*", value: "action1" }]);
  const bot2    = makeObj("bot2",  "room1", "object monitor", [{ name: "^*", value: "action2" }]);
  const db = makeDB([speaker, bot1, bot2]);

  const hits = await findCaretMatches("room1", "anything", "s1", db);
  assertEquals(hits.length, 2);
  assertEquals(hits.map(h => h.obj.id).sort(), ["bot1", "bot2"]);
});

Deno.test("findCaretMatches: no match returns empty array", async () => {
  const speaker = makeObj("s1", "room1", "player connected", []);
  const bot     = makeObj("bot1", "room1", "object monitor", [
    { name: "^hello *", value: "say hi!" },
  ]);
  const db = makeDB([speaker, bot]);

  const hits = await findCaretMatches("room1", "goodbye world", "s1", db);
  assertEquals(hits.length, 0);
});
