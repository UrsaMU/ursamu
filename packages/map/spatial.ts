// In-process chunk index for overlay / entity region scans.
// TypeGraph still loads the collection; the index avoids O(N) coord
// tests when only a few chunks intersect the viewport.

import type { Coord } from "./schemas.ts";
import { realmOf } from "./schemas.ts";

/** Tiles per chunk edge. 32² = 1024 cells per chunk. */
export const CHUNK_SIZE = 32;

export function chunkKey(c: Coord): string {
  const cx = Math.floor(c.x / CHUNK_SIZE);
  const cy = Math.floor(c.y / CHUNK_SIZE);
  return `${realmOf(c)}:${cx}:${cy}:${c.z}`;
}

/** All chunk keys that intersect an inclusive AABB. */
export function chunkKeysInRegion(min: Coord, max: Coord): string[] {
  const realm = realmOf(min);
  const xLo = Math.min(min.x, max.x);
  const xHi = Math.max(min.x, max.x);
  const yLo = Math.min(min.y, max.y);
  const yHi = Math.max(min.y, max.y);
  const zLo = Math.min(min.z, max.z);
  const zHi = Math.max(min.z, max.z);
  const keys: string[] = [];
  const cx0 = Math.floor(xLo / CHUNK_SIZE);
  const cx1 = Math.floor(xHi / CHUNK_SIZE);
  const cy0 = Math.floor(yLo / CHUNK_SIZE);
  const cy1 = Math.floor(yHi / CHUNK_SIZE);
  for (let z = zLo; z <= zHi; z++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        keys.push(`${realm}:${cx}:${cy}:${z}`);
      }
    }
  }
  return keys;
}

/**
 * Lazy spatial index: rebuilds from a full list on first use after
 * invalidate. getInRegion only scans candidates in intersecting chunks.
 */
export class SpatialIndex<T> {
  private byChunk = new Map<string, T[]>();
  private dirty = true;
  private total = 0;

  constructor(
    private readonly keyOf: (item: T) => string,
    private readonly loadAll: () => Promise<T[]>,
  ) {}

  invalidate(): void {
    this.dirty = true;
    this.byChunk.clear();
    this.total = 0;
  }

  private async ensure(): Promise<void> {
    if (!this.dirty) return;
    this.byChunk.clear();
    const all = await this.loadAll();
    this.total = all.length;
    for (const item of all) {
      const k = this.keyOf(item);
      const bucket = this.byChunk.get(k);
      if (bucket) bucket.push(item);
      else this.byChunk.set(k, [item]);
    }
    this.dirty = false;
  }

  async getInRegion(
    min: Coord,
    max: Coord,
    inBounds: (item: T) => boolean,
  ): Promise<T[]> {
    await this.ensure();
    const out: T[] = [];
    const seen = new Set<T>();
    for (const ck of chunkKeysInRegion(min, max)) {
      const bucket = this.byChunk.get(ck);
      if (!bucket) continue;
      for (const item of bucket) {
        if (seen.has(item)) continue;
        if (inBounds(item)) {
          seen.add(item);
          out.push(item);
        }
      }
    }
    return out;
  }

  async size(): Promise<number> {
    await this.ensure();
    return this.total;
  }
}
