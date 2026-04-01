/**
 * tests/softcode_dollar_patterns.test.ts
 *
 * Unit tests for matchGlob and findDollarPattern ($-pattern dispatch).
 */
import { assertEquals } from "@std/assert";
import { matchGlob, findDollarPattern } from "../src/utils/dollarPatterns.ts";
import type { IDBOBJ } from "../src/@types/IDBObj.ts";

// ── matchGlob ────────────────────────────────────────────────────────────────

Deno.test("matchGlob: exact match (no wildcards) returns []", () => {
  assertEquals(matchGlob("greet", "greet"), []);
});

Deno.test("matchGlob: exact match is case-insensitive", () => {
  assertEquals(matchGlob("GREET", "greet"), []);
  assertEquals(matchGlob("greet", "GREET"), []);
});

Deno.test("matchGlob: exact match mismatch returns null", () => {
  assertEquals(matchGlob("greet", "hello"), null);
});

Deno.test("matchGlob: single trailing wildcard captures rest", () => {
  assertEquals(matchGlob("tell *", "tell hello world"), ["hello world"]);
});

Deno.test("matchGlob: single trailing wildcard captures single word", () => {
  assertEquals(matchGlob("tell *", "tell bob"), ["bob"]);
});

Deno.test("matchGlob: single trailing wildcard no match if prefix missing", () => {
  assertEquals(matchGlob("tell *", "yell bob"), null);
});

Deno.test("matchGlob: two wildcards capture both parts", () => {
  assertEquals(matchGlob("give * to *", "give sword to bob"), ["sword", "bob"]);
});

Deno.test("matchGlob: two wildcards with multi-word values", () => {
  assertEquals(matchGlob("give * to *", "give magic sword to big bob"), ["magic sword", "big bob"]);
});

Deno.test("matchGlob: leading wildcard matches anything before suffix", () => {
  assertEquals(matchGlob("* says hi", "alice says hi"), ["alice"]);
});

Deno.test("matchGlob: wildcard at start and middle", () => {
  assertEquals(matchGlob("* give * coins", "alice give 5 coins"), ["alice", "5"]);
});

Deno.test("matchGlob: pattern with only * captures everything", () => {
  assertEquals(matchGlob("*", "anything goes here"), ["anything goes here"]);
});

Deno.test("matchGlob: prefix required even with wildcard", () => {
  assertEquals(matchGlob("say *", "sa hello"), null);
});

// ── findDollarPattern ────────────────────────────────────────────────────────

function makeObj(id: string, location: string, attrs: Array<{ name: string; value: string }>): IDBOBJ {
  return {
    id,
    location,
    flags: "object",
    data: { attributes: attrs },
    dbobj: {},
  } as unknown as IDBOBJ;
}

function makeDB(objs: IDBOBJ[]) {
  return {
    query:    async (q: unknown) => {
      const locVal = (q as { location?: string }).location;
      return objs.filter(o => o.location === locVal);
    },
    queryOne: async (q: unknown) => {
      const idVal = (q as { id?: string }).id;
      return objs.find(o => o.id === idVal) ?? null;
    },
  };
}

Deno.test("findDollarPattern: matches object in actor's inventory", async () => {
  const actor = makeObj("actor1", "room1", []);
  const item   = makeObj("item1",  "actor1", [{ name: "$take *", value: "say you picked up %0" }]);
  const db = makeDB([actor, item]);

  const hit = await findDollarPattern(actor, "take sword", "0", db);
  assertEquals(hit?.obj.id, "item1");
  assertEquals(hit?.captures, ["sword"]);
  assertEquals(hit?.attr.name, "$take *");
});

Deno.test("findDollarPattern: matches object in same room", async () => {
  const actor = makeObj("actor1", "room1", []);
  const npc   = makeObj("npc1",   "room1", [{ name: "$greet", value: "say Hello!" }]);
  const room  = makeObj("room1",  "0",     []);
  const db = makeDB([actor, npc, room]);

  const hit = await findDollarPattern(actor, "greet", "0", db);
  assertEquals(hit?.obj.id, "npc1");
  assertEquals(hit?.captures, []);
});

Deno.test("findDollarPattern: matches on room object itself", async () => {
  const actor = makeObj("actor1", "room1", []);
  const room  = makeObj("room1",  "0",     [{ name: "$look *", value: "say nothing special" }]);
  const db = makeDB([actor, room]);

  const hit = await findDollarPattern(actor, "look north", "0", db);
  assertEquals(hit?.obj.id, "room1");
  assertEquals(hit?.captures, ["north"]);
});

Deno.test("findDollarPattern: matches master room object", async () => {
  const actor  = makeObj("actor1",  "room1",  []);
  const room   = makeObj("room1",   "0",      []);
  const global = makeObj("global1", "master", [{ name: "$+ooc *", value: "say %0" }]);
  const db = makeDB([actor, room, global]);

  const hit = await findDollarPattern(actor, "+ooc hello everyone", "master", db);
  assertEquals(hit?.obj.id, "global1");
  assertEquals(hit?.captures, ["hello everyone"]);
});

Deno.test("findDollarPattern: returns null when nothing matches", async () => {
  const actor = makeObj("actor1", "room1", []);
  const room  = makeObj("room1",  "0",     []);
  const db = makeDB([actor, room]);

  const hit = await findDollarPattern(actor, "unknown command", "0", db);
  assertEquals(hit, null);
});

Deno.test("findDollarPattern: inventory checked before room (priority)", async () => {
  const actor = makeObj("actor1", "room1", []);
  const item  = makeObj("item1",  "actor1", [{ name: "$go *", value: "from inventory" }]);
  const npc   = makeObj("npc1",   "room1",  [{ name: "$go *", value: "from room" }]);
  const room  = makeObj("room1",  "0",      []);
  const db = makeDB([actor, item, npc, room]);

  const hit = await findDollarPattern(actor, "go north", "0", db);
  assertEquals(hit?.obj.id, "item1");
  assertEquals(hit?.attr.value, "from inventory");
});

Deno.test("findDollarPattern: actor excluded from room-contents scan", async () => {
  const actor = makeObj("actor1", "room1", [{ name: "$ping", value: "say pong" }]);
  const room  = makeObj("room1",  "0",     []);
  const db = makeDB([actor, room]);

  // Actor's own $attrs are NOT matched via room scan (only inventory scan)
  const hit = await findDollarPattern(actor, "ping", "0", db);
  // Actor has no inventory items with $ping, so null
  assertEquals(hit, null);
});

Deno.test("findDollarPattern: skips non-$ attrs", async () => {
  const actor = makeObj("actor1", "room1", []);
  const item  = makeObj("item1",  "actor1", [
    { name: "DESC",  value: "A shiny sword." },
    { name: "$take", value: "say taken!" },
  ]);
  const db = makeDB([actor, item]);

  const hit = await findDollarPattern(actor, "take", "0", db);
  assertEquals(hit?.attr.name, "$take");
});

Deno.test("findDollarPattern: slash switch suffix stripped from pattern", async () => {
  const actor = makeObj("actor1", "room1", []);
  const item  = makeObj("item1",  "actor1", [{ name: "$tell */noeval", value: "say %0" }]);
  const db = makeDB([actor, item]);

  const hit = await findDollarPattern(actor, "tell hello", "0", db);
  assertEquals(hit?.captures, ["hello"]);
});
