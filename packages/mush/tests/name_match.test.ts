/**
 * nameMatches / pickNameMatch — exit ;aliases and data.alias.
 */
import { assertEquals } from "jsr:@std/assert@^0.224.0";
import {
  nameMatches,
  nameMatchesExact,
  pickNameMatch,
  parseNameOrdinal,
  listNameMatches,
} from "../src/world/name-match.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("nameMatches: exit semicolon alias exact", OPTS, () => {
  const exit = {
    id: "12",
    data: { name: "Staff Lounge;SL;sl" },
  };
  assertEquals(nameMatches(exit, "sl"), true);
  assertEquals(nameMatches(exit, "SL"), true);
  assertEquals(nameMatches(exit, "staff lounge"), true);
  assertEquals(nameMatches(exit, "staff"), true);
  // Substring partial: "lounge" hits "Staff Lounge"
  assertEquals(nameMatches(exit, "lounge"), true);
  assertEquals(nameMatches(exit, "xyz"), false);
  assertEquals(nameMatchesExact(exit, "sl"), true);
  assertEquals(nameMatchesExact(exit, "staff"), false);
});

Deno.test("nameMatches: data.alias exact", OPTS, () => {
  const thing = {
    id: "3",
    data: { name: "Lantern", alias: "lamp" },
  };
  assertEquals(nameMatches(thing, "lamp"), true);
  assertEquals(nameMatches(thing, "lan"), true);
  assertEquals(nameMatches(thing, "torch"), false);
});

Deno.test("pickNameMatch prefers exact alias over prefix", OPTS, () => {
  const a = { id: "1", data: { name: "Slow Door" } };
  const b = { id: "2", data: { name: "Staff Lounge;sl" } };
  const hit = pickNameMatch([a, b], "sl");
  assertEquals(hit?.id, "2");
});

Deno.test("nameMatches: dbref and moniker", OPTS, () => {
  const p = {
    id: "2",
    state: { name: "Diablerie", moniker: "Dia" },
  };
  assertEquals(nameMatches(p, "#2"), true);
  assertEquals(nameMatches(p, "dia"), true);
  assertEquals(nameMatches(p, "Diab"), true);
});

Deno.test("nameMatches: substring partial", OPTS, () => {
  const g = { id: "9", state: { name: "Goblin Sneak" } };
  assertEquals(nameMatches(g, "gob"), true);
  assertEquals(nameMatches(g, "sneak"), true);
  assertEquals(nameMatches(g, "blin"), true);
});

Deno.test("parseNameOrdinal + pick 2nd of two", OPTS, () => {
  assertEquals(parseNameOrdinal("2.goblin"), {
    ordinal: 2,
    name: "goblin",
  });
  assertEquals(parseNameOrdinal("goblin.2").ordinal, 2);
  const a = { id: "1", state: { name: "Goblin Sneak" } };
  const b = { id: "2", state: { name: "Goblin Sneak" } };
  const hits = listNameMatches([a, b], "goblin");
  assertEquals(hits.length, 2);
  assertEquals(pickNameMatch([a, b], "2.goblin")?.id, "2");
  assertEquals(pickNameMatch([a, b], "1.gob")?.id, "1");
});
