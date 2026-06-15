import { assertEquals } from "@std/assert";

import {
  buildOcclusionLookup,
  buildVisibilityMask,
  computeLiveVisible,
  unionLiveVisible,
} from "../fog.ts";
import {
  coordKey,
  type Coord,
  type FogRecord,
  type MapEntity,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ent = (over: Partial<MapEntity> = {}): MapEntity => ({
  id: "ent-1",
  coord: { x: 0, y: 0, z: 0 },
  glyph: "R",
  kind: "vehicle",
  name: "Recon",
  vision: 3,
  ...over,
});

const transparent = () => 0;

Deno.test("computeLiveVisible: blind entity sees only own tile", OPTS, () => {
  const e = ent({ vision: 0, coord: { x: 2, y: 2, z: 0 } });
  const live = computeLiveVisible(e, transparent);
  assertEquals(live.size, 1);
  assertEquals(live.has(coordKey({ x: 2, y: 2, z: 0 })), true);
});

Deno.test("computeLiveVisible: vision=3, no occlusion → 49 tiles", OPTS, () => {
  const e = ent({ vision: 3, coord: { x: 0, y: 0, z: 0 } });
  const live = computeLiveVisible(e, transparent);
  assertEquals(live.size, 49);
});

Deno.test("computeLiveVisible: wall blocks tiles behind it", OPTS, () => {
  const e = ent({ vision: 5, coord: { x: 0, y: 0, z: 0 } });
  // wall at x=2,y=0 — blocks tiles at x=3,4,5 on that east ray
  const wall = (c: Coord) => (c.x === 2 && c.y === 0 && c.z === 0 ? 1 : 0);
  const live = computeLiveVisible(e, wall);
  // Wall tile itself should be visible
  assertEquals(live.has(coordKey({ x: 2, y: 0, z: 0 })), true);
  // Tile directly behind wall on same ray should be blocked
  assertEquals(live.has(coordKey({ x: 4, y: 0, z: 0 })), false);
});

Deno.test("computeLiveVisible: own tile always in result", OPTS, () => {
  const e = ent({ vision: 2, coord: { x: 7, y: 7, z: 0 } });
  // Even with full occlusion everywhere
  const opaque = () => 1;
  const live = computeLiveVisible(e, opaque);
  assertEquals(live.has(coordKey({ x: 7, y: 7, z: 0 })), true);
});

Deno.test("computeLiveVisible: different z plane never visible", OPTS, () => {
  const e = ent({ vision: 5, coord: { x: 0, y: 0, z: 0 } });
  const live = computeLiveVisible(e, transparent);
  assertEquals(live.has(coordKey({ x: 0, y: 0, z: 1 })), false);
  assertEquals(live.has(coordKey({ x: 1, y: 1, z: -1 })), false);
});

Deno.test("unionLiveVisible: two entities → union of fields", OPTS, () => {
  const a = ent({ id: "a", vision: 1, coord: { x: 0, y: 0, z: 0 } });
  const b = ent({ id: "b", vision: 1, coord: { x: 10, y: 10, z: 0 } });
  const u = unionLiveVisible([a, b], transparent);
  // each contributes 9 tiles (3x3) — no overlap
  assertEquals(u.size, 18);
  assertEquals(u.has(coordKey({ x: 0, y: 0, z: 0 })), true);
  assertEquals(u.has(coordKey({ x: 10, y: 10, z: 0 })), true);
});

Deno.test("unionLiveVisible: empty list → empty set", OPTS, () => {
  const u = unionLiveVisible([], transparent);
  assertEquals(u.size, 0);
});

Deno.test("buildVisibilityMask: live wins over memory", OPTS, () => {
  const key = coordKey({ x: 0, y: 0, z: 0 });
  const live = new Set<string>([key]);
  const memory: FogRecord[] = [{
    key: `owner|${key}`,
    ownerId: "owner",
    x: 0, y: 0, z: 0,
    glyph: ".",
    lastSeenAt: 1,
  }];
  const mask = buildVisibilityMask(live, memory);
  assertEquals(mask.live.has(key), true);
  // memory should NOT contain a tile that's live
  assertEquals(mask.memory.has(key), false);
});

Deno.test("buildVisibilityMask: memory-only tiles appear in mask.memory", OPTS, () => {
  const liveKey = coordKey({ x: 0, y: 0, z: 0 });
  const memKey = coordKey({ x: 5, y: 5, z: 0 });
  const live = new Set<string>([liveKey]);
  const memory: FogRecord[] = [{
    key: `owner|${memKey}`,
    ownerId: "owner",
    x: 5, y: 5, z: 0,
    glyph: ".",
    lastSeenAt: 1,
  }];
  const mask = buildVisibilityMask(live, memory);
  assertEquals(mask.memory.has(memKey), true);
  assertEquals(mask.live.has(liveKey), true);
});

Deno.test("buildOcclusionLookup: overlay occludes overrides biome", OPTS, () => {
  const biome = {
    id: "wall",
    name: "Wall",
    glyph: "#",
    occludes: 0.3,
    phrases: { self: [] },
  };
  const topo = {
    sample: (coord: Coord) => ({
      coord,
      elevation: 0.5,
      moisture: 0.5,
      biome,
    }),
    // deno-lint-ignore no-explicit-any
    sampleNeighborhood: (() => ({})) as any,
  };
  const overlays = [{
    key: "0,0,0",
    x: 0, y: 0, z: 0,
    occludes: 0.9,
  }];
  // deno-lint-ignore no-explicit-any
  const lookup = buildOcclusionLookup(topo as any, overlays);
  const atOverlay = lookup({ x: 0, y: 0, z: 0 });
  const atBiomeOnly = lookup({ x: 1, y: 0, z: 0 });
  assertEquals(atOverlay, 0.9);
  assertEquals(atBiomeOnly, 0.3);
});
