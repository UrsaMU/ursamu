import { assert, assertEquals } from "@std/assert";

import {
  _clearRenderExtensions,
  applyRenderLayers,
  collectInfoLines,
  registerInfoLine,
  registerRenderLayer,
  type RenderExtensionInput,
} from "../extensions.ts";
import type { Coord, RenderTile } from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function emptyGrid(w: number, h: number, vp: { min: Coord; max: Coord }): RenderTile[][] {
  const grid: RenderTile[][] = [];
  for (let row = 0; row < h; row++) {
    const line: RenderTile[] = [];
    for (let col = 0; col < w; col++) {
      const coord: Coord = {
        x: vp.min.x + col,
        y: vp.max.y - row,
        z: vp.min.z,
      };
      line.push({ coord, glyph: ".", authored: false });
    }
    grid.push(line);
  }
  return grid;
}

const VP = { min: { x: -1, y: -1, z: 0 }, max: { x: 1, y: 1, z: 0 } };
const INPUT: RenderExtensionInput = {
  centre: { x: 0, y: 0, z: 0 },
  viewport: VP,
  sectorTitle: "Test",
};

Deno.test("extensions: layers stack — later layer overrides earlier at same coord", OPTS, () => {
  _clearRenderExtensions();
  const grid = emptyGrid(3, 3, VP);
  registerRenderLayer("under", () => [
    { coord: { x: 0, y: 0, z: 0 }, glyph: "A", authored: true },
  ]);
  registerRenderLayer("over", () => [
    { coord: { x: 0, y: 0, z: 0 }, glyph: "B", authored: true },
  ]);
  applyRenderLayers(grid, INPUT);
  // centre is at row 1, col 1
  assertEquals(grid[1][1].glyph, "B");
  _clearRenderExtensions();
});

Deno.test("extensions: layer can paint at multiple coords; out-of-viewport ignored", OPTS, () => {
  _clearRenderExtensions();
  const grid = emptyGrid(3, 3, VP);
  registerRenderLayer("multi", () => [
    { coord: { x: 1, y: 1, z: 0 }, glyph: "@", authored: true },
    { coord: { x: 5, y: 5, z: 0 }, glyph: "?", authored: true }, // out of viewport
  ]);
  applyRenderLayers(grid, INPUT);
  // (1,1) → row=max.y-1=0, col=1-min.x=2
  assertEquals(grid[0][2].glyph, "@");
  _clearRenderExtensions();
});

Deno.test("extensions: info-line provider appends a line", OPTS, () => {
  _clearRenderExtensions();
  registerInfoLine(() => "Faction: Hutt Space");
  const lines = collectInfoLines(INPUT);
  assertEquals(lines, ["Faction: Hutt Space"]);
  _clearRenderExtensions();
});

Deno.test("extensions: info-line provider can return null to skip", OPTS, () => {
  _clearRenderExtensions();
  registerInfoLine(() => "alpha");
  registerInfoLine(() => null);
  registerInfoLine(() => "beta");
  assertEquals(collectInfoLines(INPUT), ["alpha", "beta"]);
  _clearRenderExtensions();
});

Deno.test("extensions: throwing layer is skipped; other layers + base render still complete", OPTS, () => {
  _clearRenderExtensions();
  const grid = emptyGrid(3, 3, VP);
  registerRenderLayer("boom", () => {
    throw new Error("boom");
  });
  registerRenderLayer("ok", () => [
    { coord: { x: 0, y: 0, z: 0 }, glyph: "X", authored: true },
  ]);
  applyRenderLayers(grid, INPUT);
  assertEquals(grid[1][1].glyph, "X");
  // Surrounding tiles untouched.
  assertEquals(grid[0][0].glyph, ".");
  _clearRenderExtensions();
});

Deno.test("extensions: throwing info-line provider is skipped", OPTS, () => {
  _clearRenderExtensions();
  registerInfoLine(() => {
    throw new Error("boom");
  });
  registerInfoLine(() => "still here");
  assertEquals(collectInfoLines(INPUT), ["still here"]);
  _clearRenderExtensions();
});

Deno.test("extensions: re-registering same layer name replaces in place", OPTS, () => {
  _clearRenderExtensions();
  const grid = emptyGrid(3, 3, VP);
  registerRenderLayer("a", () => [
    { coord: { x: 0, y: 0, z: 0 }, glyph: "1", authored: true },
  ]);
  registerRenderLayer("a", () => [
    { coord: { x: 0, y: 0, z: 0 }, glyph: "2", authored: true },
  ]);
  applyRenderLayers(grid, INPUT);
  assertEquals(grid[1][1].glyph, "2");
  _clearRenderExtensions();
});

Deno.test("extensions: applyRenderLayers with no layers is a no-op", OPTS, () => {
  _clearRenderExtensions();
  const grid = emptyGrid(3, 3, VP);
  applyRenderLayers(grid, INPUT);
  assert(grid.every((row) => row.every((t) => t.glyph === ".")));
});
