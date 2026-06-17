import { assertEquals } from "@std/assert";

import { createTopologyEngine } from "../topology.ts";
import { renderMap } from "../renderer.ts";
import { defaultMapConfig } from "../config.default.ts";
import { MAX_VIEWPORT_LINES } from "../schemas.ts";
import type {
  Coord,
  EntityMarker,
  RenderInput,
  RenderTile,
  TileOverlay,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };
const stripColor = (s: string): string => s.replace(/%c[a-z]/gi, "");
const visibleLen = (s: string): number => stripColor(s).length;

const overlays: TileOverlay[] = [
  {
    key: "145,219,0", x: 145, y: 219, z: 0,
    glyph: "#", kind: "infrastructure",
    name: "Forward Command Bunker", faction: "Republic",
  },
  {
    key: "145,220,0", x: 145, y: 220, z: 0,
    glyph: "+", kind: "cache",
    name: "Unsecured Munitions Cache",
  },
];

const entities: EntityMarker[] = [
  { glyph: "@", name: "Lemuel", status: "is operating in an AT-RT Walker." },
  { glyph: "R", name: 'RC-1138 "Boss"', faction: "Republic", status: "holds a defensive perimeter." },
  { glyph: "C", name: "B2-Super Battle Droid", faction: "Hostile", status: "is advancing through the brush.", groupKey: "b2" },
  { glyph: "C", name: "B2-Super Battle Droid", faction: "Hostile", status: "is advancing through the brush.", groupKey: "b2" },
];

function render(): string {
  const centre: Coord = { x: 144, y: 219, z: 0 };
  const topo = createTopologyEngine(defaultMapConfig);
  const W = defaultMapConfig.viewportWidth ?? 15;
  const H = defaultMapConfig.viewportHeight ?? 7;
  const halfW = Math.floor(W / 2);
  const halfH = Math.floor(H / 2);
  const tiles: RenderTile[][] = [];
  for (let row = 0; row < H; row++) {
    const line: RenderTile[] = [];
    const y = centre.y + (halfH - row);
    for (let col = 0; col < W; col++) {
      const x = centre.x + (col - halfW);
      const ov = overlays.find((o) => o.x === x && o.y === y && o.z === centre.z);
      if (ov?.glyph) {
        line.push({ coord: { x, y, z: centre.z }, glyph: ov.glyph, authored: true });
      } else {
        const s = topo.sample({ x, y, z: centre.z });
        line.push({ coord: { x, y, z: centre.z }, glyph: s.biome.glyph, authored: false });
      }
    }
    tiles.push(line);
  }
  const nb = topo.sampleNeighborhood(centre);
  const input: RenderInput = {
    sectorTitle: "SECTOR 4A: JABIIM TRENCHES",
    centre, tiles, neighborhood: nb, overlays, entities,
    adjacency: {
      N: nb.ring.N.biome.name, S: nb.ring.S.biome.name,
      E: nb.ring.E.biome.name, W: nb.ring.W.biome.name,
    },
  };
  return renderMap(input);
}

Deno.test("showcase: render is exactly 78 columns wide", OPTS, () => {
  const lines = render().split("\n");
  for (const l of lines) {
    if (visibleLen(l) > 78) {
      throw new Error(`line exceeds 78 cols (${visibleLen(l)}): ${JSON.stringify(l)}`);
    }
  }
  const hasFull = lines.some((l) => visibleLen(l) === 78);
  assertEquals(hasFull, true, "at least one line must be exactly 78 cols");
});

Deno.test("showcase: render fits in MAX_VIEWPORT_LINES", OPTS, () => {
  const count = render().split("\n").length;
  if (count > MAX_VIEWPORT_LINES) {
    throw new Error(`render has ${count} lines, max ${MAX_VIEWPORT_LINES}`);
  }
});

Deno.test("showcase: no MUSH-eval bracket fuel in output", OPTS, () => {
  const out = render();
  assertEquals(out.match(/\[[A-Z]/), null, "no [A-Z ... patterns allowed");
});

Deno.test("showcase: entity aggregation collapses duplicates", OPTS, () => {
  const out = render();
  if (!out.includes("2x B2-Super Battle Droid")) {
    throw new Error("expected aggregated '2x B2-Super Battle Droid' in output");
  }
});

Deno.test("showcase: snapshot matches stored fixture", OPTS, () => {
  const url = new URL("./map_render.snapshot.txt", import.meta.url);
  const out = render();
  try {
    const existing = Deno.readTextFileSync(url);
    assertEquals(out, existing, "render output diverged from snapshot — review and re-bootstrap if intentional");
  } catch (e) {
    if (e instanceof Deno.errors.NotFound) {
      Deno.writeTextFileSync(url, out);
      console.log("snapshot bootstrapped at", url.pathname);
      return;
    }
    throw e;
  }
});
