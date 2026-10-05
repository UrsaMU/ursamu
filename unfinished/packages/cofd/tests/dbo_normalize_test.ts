// Unit tests for the dbojs.query shape normalizer.
//
// The engine stores objects in raw form { id, flags: string, data: {...} }
// but plugin code expects flat { id, name, location, flags: Set, state, ... }.
// The mock store also stores the flat shape. normalize() must coerce both
// into the flat shape consistently.

import { assert, assertEquals } from "@std/assert";
import { flagsToSet, normalize } from "../src/combat/dbo_normalize.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("flagsToSet handles Set, array, and string forms", OPTS, () => {
  assertEquals([...flagsToSet(new Set(["a", "b"]))].sort(), ["a", "b"]);
  assertEquals([...flagsToSet(["a", "b"])].sort(), ["a", "b"]);
  assertEquals([...flagsToSet("a b c")].sort(), ["a", "b", "c"]);
  assertEquals([...flagsToSet("a,b,c")].sort(), ["a", "b", "c"]);
  assertEquals([...flagsToSet("")].length, 0);
  assertEquals([...flagsToSet(undefined)].length, 0);
});

Deno.test("normalize flattens engine-raw shape", OPTS, () => {
  const raw = {
    id: "42",
    flags: "npc thing",
    data: {
      name: "Thug",
      location: "room-1",
      state: { cofd: { health: { bashing: 0 } } },
      contents: [],
    },
  };
  const flat = normalize(raw);
  assertEquals(flat.id, "42");
  assertEquals(flat.name, "Thug");
  assertEquals(flat.location, "room-1");
  assert(flat.flags instanceof Set);
  assert(flat.flags.has("npc"));
  assert(flat.flags.has("thing"));
  // deno-lint-ignore no-explicit-any
  assertEquals((flat.state as any)?.cofd?.health?.bashing, 0);
});

Deno.test("normalize passes through mock-style flat shape", OPTS, () => {
  const flat = {
    id: "100",
    name: "Player",
    flags: new Set(["player", "connected"]),
    location: "room-2",
    state: { sheet: "..." },
    contents: [],
  };
  const out = normalize(flat);
  assertEquals(out.id, "100");
  assertEquals(out.name, "Player");
  assertEquals(out.location, "room-2");
  assert(out.flags.has("player"));
});

Deno.test("normalize defaults state and contents when missing", OPTS, () => {
  const raw = { id: "1", flags: "thing", data: { name: "X" } };
  const flat = normalize(raw);
  assertEquals(flat.state, {});
  assertEquals(flat.contents, []);
});
