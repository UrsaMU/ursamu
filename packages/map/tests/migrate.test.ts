import { assert, assertEquals } from "@std/assert";

import { DBO } from "ursamu";
import { migrateFogKeys, migrateOverlayKeys, migrateToV3 } from "../migrate.ts";
import {
  FOG_COLLECTION,
  type FogRecord,
  OVERLAY_COLLECTION,
  type TileOverlay,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

type StoredOverlay = TileOverlay & { id: string };
type StoredFog = FogRecord & { id: string };

const overlays = new DBO<StoredOverlay>(OVERLAY_COLLECTION);
const fog = new DBO<StoredFog>(FOG_COLLECTION);

async function clear(): Promise<void> {
  const o = await overlays.all();
  for (const row of o) await overlays.delete({ id: row.id });
  const f = await fog.all();
  for (const row of f) await fog.delete({ id: row.id });
}

Deno.test("migrate: overlays in legacy format get rewritten to v3 keys", OPTS, async () => {
  await clear();
  // Simulate a pre-v3 row by writing directly with legacy id/key.
  const legacy: StoredOverlay = {
    id: "10,20,0",
    key: "10,20,0",
    x: 10, y: 20, z: 0,
    glyph: "#", name: "Old-Spot", kind: "landmark",
  };
  await overlays.update({ id: legacy.id }, legacy);

  const report = await migrateOverlayKeys();
  assertEquals(report.inspected, 1);
  assertEquals(report.rewritten, 1);
  assertEquals(report.skipped, 0);

  // Legacy row gone, new row in place.
  const oldRow = await overlays.findOne({ id: "10,20,0" });
  assert(!oldRow);
  const newRow = await overlays.findOne({ id: "default:10,20,0" });
  assert(newRow, "v3-keyed row exists");
  assertEquals(newRow!.key, "default:10,20,0");
  assertEquals(newRow!.name, "Old-Spot");

  await clear();
});

Deno.test("migrate: idempotent — second pass rewrites nothing", OPTS, async () => {
  await clear();
  const legacy: StoredOverlay = {
    id: "5,5,0", key: "5,5,0", x: 5, y: 5, z: 0, glyph: ".",
  };
  await overlays.update({ id: legacy.id }, legacy);
  await migrateOverlayKeys();
  const second = await migrateOverlayKeys();
  assertEquals(second.rewritten, 0);
  assertEquals(second.skipped, 1);
  await clear();
});

Deno.test("migrate: fog records get realm-prefixed composite keys", OPTS, async () => {
  await clear();
  const legacy: StoredFog = {
    id: "owner|3,3,0",
    key: "owner|3,3,0",
    ownerId: "owner",
    x: 3, y: 3, z: 0,
    glyph: ".",
    lastSeenAt: 1,
  };
  await fog.update({ id: legacy.id }, legacy);

  const report = await migrateFogKeys();
  assertEquals(report.rewritten, 1);
  const oldRow = await fog.findOne({ id: "owner|3,3,0" });
  assert(!oldRow);
  const newRow = await fog.findOne({ id: "owner|default:3,3,0" });
  assert(newRow);
  assertEquals(newRow!.key, "owner|default:3,3,0");
  await clear();
});

Deno.test("migrate: migrateToV3 runs both collections", OPTS, async () => {
  await clear();
  await overlays.update({ id: "1,1,0" }, {
    id: "1,1,0", key: "1,1,0", x: 1, y: 1, z: 0, glyph: ".",
  });
  await fog.update({ id: "o|1,1,0" }, {
    id: "o|1,1,0", key: "o|1,1,0", ownerId: "o", x: 1, y: 1, z: 0, glyph: ".", lastSeenAt: 1,
  });
  const report = await migrateToV3();
  assertEquals(report.overlays.rewritten, 1);
  assertEquals(report.fog.rewritten, 1);
  await clear();
});

Deno.test("migrate: non-default realm rows preserve their realm", OPTS, async () => {
  await clear();
  // Simulate a row stamped with realm but pre-v3 id format.
  const legacy: StoredOverlay = {
    id: "7,7,0", key: "7,7,0",
    x: 7, y: 7, z: 0, realm: "tatooine",
    glyph: "T",
  };
  await overlays.update({ id: legacy.id }, legacy);
  await migrateOverlayKeys();
  const newRow = await overlays.findOne({ id: "tatooine:7,7,0" });
  assert(newRow);
  assertEquals(newRow!.realm, "tatooine");
  await clear();
});
