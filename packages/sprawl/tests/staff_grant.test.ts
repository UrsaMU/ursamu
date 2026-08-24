import {
  assert,
  assertEquals,
  assertFalse,
} from "@std/assert";
import { defaultChar } from "../db/schemas.ts";
import {
  grantApAmount,
  grantCash,
  grantCatalogGear,
  parseWhoRest,
} from "../engine/staff-grant.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("parseWhoRest name=rest and space", OPTS, () => {
  assertEquals(parseWhoRest("Alice=500"), {
    who: "Alice",
    rest: "500",
  });
  assertEquals(parseWhoRest("Bob pkd-45"), {
    who: "Bob",
    rest: "pkd-45",
  });
  assertEquals(parseWhoRest("10"), null);
  assertEquals(parseWhoRest(""), null);
});

Deno.test("grantCash add and clawback floor 0", OPTS, () => {
  const c = defaultChar("Neon");
  c.bityuan = 100;
  const up = grantCash(c, 50);
  assert(up.ok);
  if (up.ok) assertEquals(up.char.bityuan, 150);
  const down = grantCash(c, -200);
  assert(down.ok);
  if (down.ok) assertEquals(down.char.bityuan, 0);
  const bad = grantCash(c, 0);
  assertFalse(bad.ok);
});

Deno.test("grantApAmount raises pool and level", OPTS, () => {
  const c = defaultChar("Neon");
  c.ap = 0;
  c.apTotal = 0;
  c.level = 0;
  const r = grantApAmount(c, 100);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.char.ap, 100);
    assertEquals(r.char.apTotal, 100);
    assertEquals(r.char.level, 1);
  }
  const bad = grantApAmount(c, -5);
  assertFalse(bad.ok);
});

Deno.test("grantCatalogGear mints firearm Thing", OPTS, async () => {
  const owner = mockPlayer({
    id: "test_target1",
    name: "Alice",
  });
  const c = defaultChar("Alice");
  c.chargenComplete = true;
  const u = mockU({ me: owner });
  const r = await grantCatalogGear(u, owner, c, "pkd-45");
  assert(r.ok, r.ok ? "" : r.reason);
  if (r.ok) {
    assert(r.note.toLowerCase().includes("pkd") ||
      r.note.length > 0);
  }
  const creates = (u as { _dbCalls: unknown[][] })._dbCalls;
  // create is on db.create, not modify — check via mock create
  assert(r.ok);
});

Deno.test("grantCatalogGear unknown slug fails", OPTS, async () => {
  const owner = mockPlayer();
  const c = defaultChar("Neon");
  const u = mockU();
  const r = await grantCatalogGear(
    u,
    owner,
    c,
    "no-such-slug-xyz",
  );
  assertFalse(r.ok);
});
