import { createTopologyEngine } from "./topology.ts";
import { renderMap } from "./renderer.ts";
import { defaultMapConfig } from "./config.default.ts";
import type { EntityMarker, RenderTile, TileOverlay } from "./schemas.ts";

const centre = { x: 144, y: 219, z: 0 };
const topo = createTopologyEngine(defaultMapConfig);
const W = 15, H = 7;
const overlays: TileOverlay[] = [
  { key: "145,219,0", x: 145, y: 219, z: 0, glyph: "#", kind: "infrastructure", name: "Forward Command Bunker", faction: "Republic" },
  { key: "145,220,0", x: 145, y: 220, z: 0, glyph: "+", kind: "cache", name: "Unsecured Munitions Cache" },
];
const tiles: RenderTile[][] = [];
const halfW = 7, halfH = 3;
for (let row = 0; row < H; row++) {
  const line: RenderTile[] = [];
  const y = centre.y + (halfH - row);
  for (let col = 0; col < W; col++) {
    const x = centre.x + (col - halfW);
    const ov = overlays.find((o) => o.x === x && o.y === y && o.z === centre.z);
    if (ov?.glyph) line.push({ coord: { x, y, z: centre.z }, glyph: ov.glyph, authored: true });
    else line.push({ coord: { x, y, z: centre.z }, glyph: topo.sample({ x, y, z: centre.z }).biome.glyph, authored: false });
  }
  tiles.push(line);
}
const nb = topo.sampleNeighborhood(centre);
const entities: EntityMarker[] = [
  { glyph: "@", name: "Lemuel", status: "is operating in an AT-RT Walker." },
  { glyph: "R", name: 'RC-1138 "Boss"', faction: "Republic", status: "holds a defensive perimeter." },
  { glyph: "C", name: "B2-Super Battle Droid", faction: "Hostile", status: "is advancing through the brush.", groupKey: "b2" },
  { glyph: "C", name: "B2-Super Battle Droid", faction: "Hostile", status: "is advancing through the brush.", groupKey: "b2" },
];
const out = renderMap({
  sectorTitle: "SECTOR 4A: JABIIM TRENCHES",
  centre, tiles, neighborhood: nb, overlays, entities,
  adjacency: {
    N: nb.ring.N.biome.name, S: nb.ring.S.biome.name,
    E: nb.ring.E.biome.name, W: nb.ring.W.biome.name,
  },
});
await Deno.writeTextFile(new URL("./tests/map_render.snapshot.txt", import.meta.url), out);
console.log(out.split("\n").slice(0, 12).join("\n"));
