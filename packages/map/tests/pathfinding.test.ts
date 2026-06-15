import { assert, assertEquals } from "@std/assert";

import { findPath, getTraversalCost } from "../pathfinding.ts";
import {
  _clearMapConfigs,
  registerMapConfig,
} from "../mapconfig.ts";
import type { Coord, MapConfig, TileOverlay } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function uniformCfg(traversal: NonNullable<MapConfig["biomes"][number]["traversal"]>): MapConfig {
  return {
    noise: {
      elevation: { seed: "e", scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
      moisture:  { seed: "m", scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
    },
    biomes: [{ id: "b", name: "B", glyph: ".", phrases: { self: [] }, traversal }],
    legend: { terrain: ["."], infrastructure: ["#"], entities: ["@"] },
    matrix: [{ elevation: [0, 1], moisture: [0, 1], biome: "b" }],
  };
}

Deno.test("pathfinding: traversal cost from biome class", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy-realm", uniformCfg("easy"));
  registerMapConfig("rough-realm", uniformCfg("rough"));
  registerMapConfig("imp-realm", uniformCfg("impassable"));

  assertEquals(
    getTraversalCost({ x: 0, y: 0, z: 0, realm: "easy-realm" }, { x: 1, y: 0, z: 0, realm: "easy-realm" }),
    1,
  );
  assertEquals(
    getTraversalCost({ x: 0, y: 0, z: 0, realm: "rough-realm" }, { x: 1, y: 0, z: 0, realm: "rough-realm" }),
    2,
  );
  assertEquals(
    getTraversalCost({ x: 0, y: 0, z: 0, realm: "imp-realm" }, { x: 1, y: 0, z: 0, realm: "imp-realm" }),
    Number.POSITIVE_INFINITY,
  );
  _clearMapConfigs();
});

Deno.test("pathfinding: overlay blocksMovement makes a tile impassable", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("test", uniformCfg("easy"));
  const overlays: TileOverlay[] = [{
    key: "test:1,0,0", x: 1, y: 0, z: 0, realm: "test", blocksMovement: true,
  }];
  const cost = getTraversalCost(
    { x: 0, y: 0, z: 0, realm: "test" },
    { x: 1, y: 0, z: 0, realm: "test" },
    { overlays },
  );
  assertEquals(cost, Number.POSITIVE_INFINITY);
  _clearMapConfigs();
});

Deno.test("pathfinding: findPath returns 1-step sequence on a clear easy realm", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy", uniformCfg("easy"));
  const path = findPath(
    { x: 0, y: 0, z: 0, realm: "easy" },
    { x: 5, y: 0, z: 0, realm: "easy" },
    { diagonal: false },
  );
  assert(path, "should find a path");
  assertEquals(path!.length, 6); // inclusive endpoints, 5 steps
  // Each step moves by exactly 1 axis.
  for (let i = 1; i < path!.length; i++) {
    const a = path![i - 1], b = path![i];
    assert(Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1);
  }
  _clearMapConfigs();
});

Deno.test("pathfinding: findPath honors overlays array as a blocker", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy", uniformCfg("easy"));
  // Block the direct route at (1,0); A* should route around via (1,1) etc.
  const overlays: TileOverlay[] = [{
    key: "easy:1,0,0", x: 1, y: 0, z: 0, realm: "easy", blocksMovement: true,
  }];
  const path = findPath(
    { x: 0, y: 0, z: 0, realm: "easy" },
    { x: 2, y: 0, z: 0, realm: "easy" },
    { overlays },
  );
  assert(path);
  for (const step of path!) {
    assert(!(step.x === 1 && step.y === 0), "should not cross blocked tile");
  }
  _clearMapConfigs();
});

Deno.test("pathfinding: findPath returns null when target unreachable within maxCost", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy", uniformCfg("easy"));
  const path = findPath(
    { x: 0, y: 0, z: 0, realm: "easy" },
    { x: 50, y: 50, z: 0, realm: "easy" },
    { maxCost: 5 },
  );
  assertEquals(path, null);
  _clearMapConfigs();
});

Deno.test("pathfinding: findPath returns null across realms or z planes", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy", uniformCfg("easy"));
  registerMapConfig("other", uniformCfg("easy"));
  assertEquals(
    findPath({ x: 0, y: 0, z: 0, realm: "easy" }, { x: 1, y: 0, z: 0, realm: "other" }),
    null,
  );
  assertEquals(
    findPath({ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 1 }),
    null,
  );
  _clearMapConfigs();
});

Deno.test("pathfinding: avoid filter excludes coords", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("easy", uniformCfg("easy"));
  const avoid = (c: Coord): boolean => c.x === 1 && c.y === 0;
  const path = findPath(
    { x: 0, y: 0, z: 0, realm: "easy" },
    { x: 2, y: 0, z: 0, realm: "easy" },
    { avoid },
  );
  assert(path);
  for (const step of path!) {
    assert(!(step.x === 1 && step.y === 0), "avoided tile not used");
  }
  _clearMapConfigs();
});
