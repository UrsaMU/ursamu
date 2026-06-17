import { assertEquals } from "@std/assert";

import { effectiveRegions, getRegion, getRegionPath } from "../regions.ts";
import type { MapConfig, Region } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// Minimal config — only the fields the region helpers read.
function cfg(part: Partial<MapConfig>): MapConfig {
  return {
    noise: {
      elevation: { seed: "e", scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
      moisture:  { seed: "m", scale: 1, octaves: [{ frequency: 1, amplitude: 1 }] },
    },
    biomes: [{ id: "b", name: "B", glyph: ".", phrases: { self: [] } }],
    legend: { terrain: ["."], infrastructure: ["#"], entities: ["@"] },
    matrix: [{ elevation: [0, 1], moisture: [0, 1], biome: "b" }],
    ...part,
  };
}

Deno.test("regions: getRegion returns null when no regions configured", OPTS, () => {
  assertEquals(getRegion(cfg({}), { x: 0, y: 0, z: 0 }), null);
});

Deno.test("regions: legacy `sectors` map auto-converts to single-level Regions", OPTS, () => {
  const c = cfg({
    sectors: {
      mos: { name: "Mos Eisley", aabb: [{ x: -5, y: -5, z: 0 }, { x: 5, y: 5, z: 0 }] },
    },
  });
  const regions = effectiveRegions(c);
  assertEquals(regions.length, 1);
  assertEquals(regions[0].name, "Mos Eisley");
  assertEquals(getRegion(c, { x: 0, y: 0, z: 0 })?.name, "Mos Eisley");
});

Deno.test("regions: deepest nested region wins (City inside Country inside Continent)", OPTS, () => {
  const regions: Region[] = [
    { slug: "continent", name: "Continent", aabb: [{ x: -100, y: -100, z: 0 }, { x: 100, y: 100, z: 0 }] },
    { slug: "country",   name: "Country",   aabb: [{ x: -50, y: -50, z: 0 }, { x: 50, y: 50, z: 0 }], parent: "continent" },
    { slug: "city",      name: "City",      aabb: [{ x: -5, y: -5, z: 0 }, { x: 5, y: 5, z: 0 }], parent: "country" },
  ];
  const c = cfg({ regions });
  // Inside the city
  assertEquals(getRegion(c, { x: 0, y: 0, z: 0 })?.slug, "city");
  // Outside city but inside country
  assertEquals(getRegion(c, { x: 20, y: 0, z: 0 })?.slug, "country");
  // Outside country but inside continent
  assertEquals(getRegion(c, { x: 80, y: 0, z: 0 })?.slug, "continent");
  // Out of all regions
  assertEquals(getRegion(c, { x: 999, y: 0, z: 0 }), null);
});

Deno.test("regions: getRegionPath returns deepest-to-outermost chain", OPTS, () => {
  const regions: Region[] = [
    { slug: "continent", name: "Continent", aabb: [{ x: -100, y: -100, z: 0 }, { x: 100, y: 100, z: 0 }] },
    { slug: "country",   name: "Country",   aabb: [{ x: -50, y: -50, z: 0 }, { x: 50, y: 50, z: 0 }], parent: "continent" },
    { slug: "city",      name: "City",      aabb: [{ x: -5, y: -5, z: 0 }, { x: 5, y: 5, z: 0 }], parent: "country" },
  ];
  const path = getRegionPath(cfg({ regions }), { x: 0, y: 0, z: 0 });
  assertEquals(path.map((r) => r.slug), ["city", "country", "continent"]);
});

Deno.test("regions: cycle in parent links does not loop forever", OPTS, () => {
  const regions: Region[] = [
    { slug: "a", name: "A", aabb: [{ x: -1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }], parent: "b" },
    { slug: "b", name: "B", aabb: [{ x: -1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }], parent: "a" },
  ];
  const path = getRegionPath(cfg({ regions }), { x: 0, y: 0, z: 0 });
  // We just want this to terminate; the chain shape is whichever was matched
  // as "deepest" by the cycle-guarded depth calculation.
  assertEquals(path.length > 0, true);
  assertEquals(path.length <= 2, true);
});

Deno.test("regions: metadata + tags surface on returned regions", OPTS, () => {
  const r: Region = {
    slug: "huttspace", name: "Hutt Space",
    aabb: [{ x: -10, y: -10, z: 0 }, { x: 10, y: 10, z: 0 }],
    tags: ["lawless"], metadata: { jurisdiction: "Hutt Cartel" },
  };
  const found = getRegion(cfg({ regions: [r] }), { x: 0, y: 0, z: 0 });
  assertEquals(found?.tags, ["lawless"]);
  assertEquals(found?.metadata, { jurisdiction: "Hutt Cartel" });
});
