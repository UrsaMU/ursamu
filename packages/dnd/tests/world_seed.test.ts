/**
 * Starter world graph + seed smoke (in-memory DBO).
 */
import { assertEquals, assert } from "@std/assert";
import {
  validateWorldGraph,
  WORLD,
  seedStarterWorld,
  getSeedRecord,
} from "../src/world/seed.ts";
import {
  resolveMapTiles,
  validateTownMap,
  formatMapSummary,
} from "../src/world/map-seed.ts";
import { DBO } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("starter world graph is consistent", OPTS, () => {
  const errs = validateWorldGraph(WORLD);
  assertEquals(errs, [], errs.join("; "));
  assert(WORLD.rooms.length >= 8);
  assert(WORLD.exits.length >= 10);
  assert(WORLD.vendors && WORLD.vendors.length >= 1);
  assert(WORLD.npcs && WORLD.npcs.length >= 1);
  const keys = new Set(WORLD.rooms.map((r) => r.key));
  assert(keys.has("square"));
  assert(keys.has("camp"));
  assert(keys.has("forge"));
});

Deno.test("town map footprint resolves tiles", OPTS, () => {
  assert(WORLD.map);
  assertEquals(validateTownMap(WORLD), []);
  const tiles = resolveMapTiles(WORLD, {
    square: "10",
    camp: "20",
  });
  assertEquals(tiles.length, WORLD.map!.tiles.length);
  const sq = tiles.find((t) => t.key === "square");
  assert(sq);
  assertEquals(sq.x, WORLD.map!.origin.x);
  assertEquals(sq.y, WORLD.map!.origin.y);
  assertEquals(sq.roomId, "10");
  const camp = tiles.find((t) => t.key === "camp");
  assert(camp);
  assertEquals(camp.y, WORLD.map!.origin.y - 3);
  assert(formatMapSummary(WORLD, tiles).includes("Havenbrook"));
});

Deno.test("seedStarterWorld is idempotent", OPTS, async () => {
  // Fresh namespace isolation: clear prior seed record if any
  const db = new DBO<{ id: string }>("dnd.world_seed");
  try {
    await db.delete({ id: "starter" });
  } catch {
    /* empty */
  }

  const first = await seedStarterWorld();
  assertEquals(first.ok, true, first.message);
  assert(!first.skipped, first.message);
  assert(first.record);
  assert(
    Object.keys(first.record.rooms).length === WORLD.rooms.length,
  );

  const second = await seedStarterWorld();
  assertEquals(second.ok, true, second.message);
  assertEquals(second.skipped, true);

  const rec = await getSeedRecord();
  assert(rec);
  assertEquals(rec.worldId, WORLD.id);
  assertEquals(rec.rooms.square, first.record!.rooms.square);

  await DBO.close();
});
