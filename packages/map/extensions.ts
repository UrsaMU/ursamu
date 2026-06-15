// Render extension points: sibling plugins paint additional tile layers on top
// of the base render and/or append lines to the right-hand info pane. Each
// provider is sandboxed — a thrown layer is logged and skipped, and the render
// still completes.

import type { Coord, RenderTile } from "./schemas.ts";

// ─── Public types ────────────────────────────────────────────────────────────

export interface RenderExtensionInput {
  /** Centre of the viewport. */
  centre: Coord;
  /** Inclusive viewport bounds (z always matches centre.z). */
  viewport: { min: Coord; max: Coord };
  /** The title the renderer would draw, post any framework prefixes. */
  sectorTitle: string;
  /** Active entity/player id if known to the renderer. */
  playerId?: string;
}

/**
 * A layer function returns RenderTile overrides keyed by coord. Coords outside
 * the viewport are ignored. Later registrations paint over earlier ones at the
 * same coord (registration order). Return `undefined` / nothing for a no-op.
 */
export type RenderLayerFn = (
  input: RenderExtensionInput,
) => RenderTile[] | void | undefined;

export type InfoLineFn = (
  input: RenderExtensionInput,
) => string | null | undefined;

// ─── Registry ────────────────────────────────────────────────────────────────

interface LayerEntry {
  name: string;
  fn: RenderLayerFn;
}

const layers: LayerEntry[] = [];
const infoLines: InfoLineFn[] = [];

/** Register a render layer. Re-registering the same name replaces in place. */
export function registerRenderLayer(name: string, fn: RenderLayerFn): void {
  const idx = layers.findIndex((l) => l.name === name);
  if (idx >= 0) layers[idx] = { name, fn };
  else layers.push({ name, fn });
}

export function unregisterRenderLayer(name: string): void {
  const idx = layers.findIndex((l) => l.name === name);
  if (idx >= 0) layers.splice(idx, 1);
}

export function registerInfoLine(fn: InfoLineFn): void {
  if (!infoLines.includes(fn)) infoLines.push(fn);
}

export function unregisterInfoLine(fn: InfoLineFn): void {
  const idx = infoLines.indexOf(fn);
  if (idx >= 0) infoLines.splice(idx, 1);
}

/** Test-only: drop all extensions. */
export function _clearRenderExtensions(): void {
  layers.length = 0;
  infoLines.length = 0;
}

// ─── Apply ───────────────────────────────────────────────────────────────────

const inViewport = (c: Coord, vp: RenderExtensionInput["viewport"]): boolean =>
  c.x >= vp.min.x && c.x <= vp.max.x &&
  c.y >= vp.min.y && c.y <= vp.max.y &&
  c.z === vp.min.z;

/**
 * Apply all registered layers to `tiles` IN PLACE. Each layer's returned
 * RenderTile array overrides matching coords in the grid. Layers run in
 * registration order — later wins at the same coord.
 *
 * `tiles` is the [row][col] grid the renderer is about to draw. The grid is
 * indexed as in format.ts buildTiles: row = vp.max.y - y, col = x - vp.min.x.
 */
export function applyRenderLayers(
  tiles: RenderTile[][],
  input: RenderExtensionInput,
): void {
  if (layers.length === 0) return;
  const h = tiles.length;
  const w = h > 0 ? tiles[0].length : 0;
  for (const { name, fn } of layers) {
    let overrides: RenderTile[] | void | undefined;
    try {
      overrides = fn(input);
    } catch (err) {
      console.error(`[map-plugin] render layer "${name}" threw:`, err);
      continue;
    }
    if (!overrides || overrides.length === 0) continue;
    for (const o of overrides) {
      if (!inViewport(o.coord, input.viewport)) continue;
      const row = input.viewport.max.y - o.coord.y;
      const col = o.coord.x - input.viewport.min.x;
      if (row < 0 || row >= h || col < 0 || col >= w) continue;
      tiles[row][col] = o;
    }
  }
}

/**
 * Collect info-line strings from all registered providers. Throwing providers
 * are logged and skipped. Null/undefined returns drop out.
 */
export function collectInfoLines(
  input: RenderExtensionInput,
): string[] {
  const out: string[] = [];
  for (const fn of infoLines) {
    let line: string | null | undefined;
    try {
      line = fn(input);
    } catch (err) {
      console.error("[map-plugin] info-line provider threw:", err);
      continue;
    }
    if (typeof line === "string" && line.length > 0) out.push(line);
  }
  return out;
}
