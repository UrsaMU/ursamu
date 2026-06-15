import { assert, assertEquals, assertNotEquals } from "@std/assert";

import {
  _clearMapConfigs,
  getMapConfig,
  getTopologyEngine,
  listRegisteredRealms,
  registerMapConfig,
  unregisterMapConfig,
} from "../mapconfig.ts";
import { defaultMapConfig } from "../config.default.ts";
import type { MapConfig } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function makeCfg(seed: string, glyph: string): MapConfig {
  return {
    noise: {
      elevation: { seed: `e-${seed}`, scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
      moisture:  { seed: `m-${seed}`, scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
    },
    biomes: [{
      id: "b", name: "B", glyph,
      phrases: { self: [], adjacent: [] },
    }],
    legend: { terrain: [glyph], infrastructure: ["#"], entities: ["@"] },
    matrix: [{ elevation: [0, 1], moisture: [0, 1], biome: "b" }],
  };
}

Deno.test("mapconfig: getMapConfig falls back to defaultMapConfig when none registered", OPTS, () => {
  _clearMapConfigs();
  assertEquals(getMapConfig("nonexistent"), defaultMapConfig);
  assertEquals(getMapConfig(undefined), defaultMapConfig);
});

Deno.test("mapconfig: register/get/unregister round-trip", OPTS, () => {
  _clearMapConfigs();
  const cfg = makeCfg("alpha", "A");
  registerMapConfig("alpha", cfg);
  assertEquals(getMapConfig("alpha"), cfg);
  assertEquals(listRegisteredRealms(), ["alpha"]);
  unregisterMapConfig("alpha");
  assertEquals(getMapConfig("alpha"), defaultMapConfig);
});

Deno.test("mapconfig: two realms can ship different biome glyphs", OPTS, () => {
  _clearMapConfigs();
  registerMapConfig("alpha", makeCfg("alpha", "A"));
  registerMapConfig("beta", makeCfg("beta", "B"));
  const a = getMapConfig("alpha");
  const b = getMapConfig("beta");
  assertEquals(a.biomes[0].glyph, "A");
  assertEquals(b.biomes[0].glyph, "B");
  // Sample each realm's engine — different seeds produce different fields.
  const aSample = getTopologyEngine("alpha").sample({ x: 7, y: 11, z: 0 });
  const bSample = getTopologyEngine("beta").sample({ x: 7, y: 11, z: 0 });
  // Different seeds → different elevation/moisture at the same coord.
  assertNotEquals(aSample.elevation, bSample.elevation);
  _clearMapConfigs();
});

Deno.test("mapconfig: TopologyEngine is cached per realm", OPTS, () => {
  _clearMapConfigs();
  const e1 = getTopologyEngine("alpha");
  const e2 = getTopologyEngine("alpha");
  assert(e1 === e2, "cached engine reused");
  const e3 = getTopologyEngine("beta");
  assert(e1 !== e3, "different realm → different engine");
  _clearMapConfigs();
});

Deno.test("mapconfig: registerMapConfig invalidates the cached engine for that realm", OPTS, () => {
  _clearMapConfigs();
  const e1 = getTopologyEngine("alpha");
  registerMapConfig("alpha", makeCfg("alpha-2", "A"));
  const e2 = getTopologyEngine("alpha");
  assert(e1 !== e2, "engine rebuilt after re-registration");
  _clearMapConfigs();
});
