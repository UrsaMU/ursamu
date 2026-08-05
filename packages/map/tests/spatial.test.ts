import { assertEquals } from "@std/assert";
import {
  CHUNK_SIZE,
  chunkKey,
  chunkKeysInRegion,
  SpatialIndex,
} from "../spatial.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("chunkKey buckets by CHUNK_SIZE", OPTS, () => {
  assertEquals(
    chunkKey({ x: 0, y: 0, z: 0 }),
    `default:0:0:0`,
  );
  assertEquals(
    chunkKey({ x: CHUNK_SIZE - 1, y: 0, z: 0 }),
    `default:0:0:0`,
  );
  assertEquals(
    chunkKey({ x: CHUNK_SIZE, y: 0, z: 0 }),
    `default:1:0:0`,
  );
  assertEquals(
    chunkKey({ x: -1, y: 0, z: 0 }),
    `default:-1:0:0`,
  );
});

Deno.test("chunkKeysInRegion covers AABB", OPTS, () => {
  const keys = chunkKeysInRegion(
    { x: 0, y: 0, z: 0 },
    { x: CHUNK_SIZE + 1, y: 1, z: 0 },
  );
  assertEquals(keys.includes("default:0:0:0"), true);
  assertEquals(keys.includes("default:1:0:0"), true);
});

Deno.test("SpatialIndex filters by chunk then bounds", OPTS, async () => {
  type Item = { id: string; x: number; y: number; z: number };
  const items: Item[] = [
    { id: "a", x: 0, y: 0, z: 0 },
    { id: "b", x: 1000, y: 1000, z: 0 },
    { id: "c", x: 1, y: 1, z: 0 },
  ];
  const idx = new SpatialIndex<Item>(
    (i) => chunkKey({ x: i.x, y: i.y, z: i.z }),
    async () => items,
  );
  const hit = await idx.getInRegion(
    { x: -5, y: -5, z: 0 },
    { x: 5, y: 5, z: 0 },
    (i) => i.x >= -5 && i.x <= 5 && i.y >= -5 && i.y <= 5,
  );
  assertEquals(hit.map((i) => i.id).sort(), ["a", "c"]);
});
