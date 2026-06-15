// One-shot migrations for pre-v3 deployments.
//
// v3 changed two on-disk formats:
//   1. `coordKey` now produces "realm:x,y,z" (was "x,y,z"). The DBO `id`
//      stored on each TileOverlay and the cached `key` field both follow.
//   2. FogRecord stored keys gained the same realm prefix via writeMemoryBatch.
//
// Existing data is still readable (realmOf() normalizes missing realm to
// "default") but the stored `id` / `key` of pre-v3 rows is stale. This module
// provides idempotent rewriters that bring those rows into the v3 format so
// new lookups by coord hit cleanly.

import { DBO } from "ursamu";
import {
  coordKey,
  DEFAULT_REALM,
  FOG_COLLECTION,
  type FogRecord,
  OVERLAY_COLLECTION,
  realmOf,
  type TileOverlay,
} from "./schemas.ts";

type StoredOverlay = TileOverlay & { id: string };
type StoredFog = FogRecord & { id: string };

export interface MigrationReport {
  inspected: number;
  rewritten: number;
  skipped: number;
}

/**
 * Rewrite every TileOverlay row whose `id` / `key` is in the legacy
 * "x,y,z" format into the v3 "realm:x,y,z" form. Idempotent — rows already
 * in the new format are skipped. Pre-v3 rows have no `realm` field; we
 * treat them as DEFAULT_REALM.
 */
export async function migrateOverlayKeys(): Promise<MigrationReport> {
  const overlays = new DBO<StoredOverlay>(OVERLAY_COLLECTION);
  const all = await overlays.all();
  let rewritten = 0;
  let skipped = 0;
  for (const row of all) {
    const target = coordKey({
      x: row.x, y: row.y, z: row.z, realm: row.realm,
    });
    if (row.id === target && row.key === target) {
      skipped += 1;
      continue;
    }
    // Delete the stale row and re-insert under the new id.
    await overlays.delete({ id: row.id });
    const realm = realmOf(row);
    const next: StoredOverlay = {
      ...row,
      id: target,
      key: target,
      realm: realm === DEFAULT_REALM ? row.realm : realm,
    };
    await overlays.update({ id: target }, next);
    rewritten += 1;
  }
  return { inspected: all.length, rewritten, skipped };
}

/**
 * Same migration for FogRecord rows. The stored composite is
 * `${ownerId}|${coordKey}`, so any row whose composite key uses the legacy
 * tail gets rewritten in place.
 */
export async function migrateFogKeys(): Promise<MigrationReport> {
  const fog = new DBO<StoredFog>(FOG_COLLECTION);
  const all = await fog.all();
  let rewritten = 0;
  let skipped = 0;
  for (const row of all) {
    const tail = coordKey({
      x: row.x, y: row.y, z: row.z, realm: row.realm,
    });
    const target = `${row.ownerId}|${tail}`;
    if (row.id === target && row.key === target) {
      skipped += 1;
      continue;
    }
    await fog.delete({ id: row.id });
    const next: StoredFog = { ...row, id: target, key: target };
    await fog.update({ id: target }, next);
    rewritten += 1;
  }
  return { inspected: all.length, rewritten, skipped };
}

/**
 * Run all v3 migrations in order. Safe to call repeatedly — each step is
 * idempotent. Returns per-collection reports.
 */
export async function migrateToV3(): Promise<{
  overlays: MigrationReport;
  fog: MigrationReport;
}> {
  const overlays = await migrateOverlayKeys();
  const fog = await migrateFogKeys();
  return { overlays, fog };
}
