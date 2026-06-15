// Pathfinding primitives. Consumers building combat / movement systems re-use
// `getTraversalCost` and `findPath` rather than re-implementing A* per plugin.

import type { BiomeDefinition, Coord, MapConfig, TileOverlay } from "./schemas.ts";
import { realmOf } from "./schemas.ts";
import { getMapConfig, getTopologyEngine } from "./mapconfig.ts";

const TRAVERSAL_COST: Record<NonNullable<BiomeDefinition["traversal"]>, number> = {
  trivial: 1,
  easy: 1,
  rough: 2,
  hazard: 3,
  impassable: Number.POSITIVE_INFINITY,
};

interface BiomeLookup {
  biomeAt(c: Coord): BiomeDefinition;
}

function biomeLookupFor(cfg: MapConfig, realm: string): BiomeLookup {
  const topo = getTopologyEngine(realm);
  void cfg; // cfg is read via mapconfig; kept in signature for caller intent
  return { biomeAt: (c) => topo.sample(c).biome };
}

/**
 * Cost to enter `to` from `from`. `from` is irrelevant to the base topology
 * cost (we charge by destination tile), but it's accepted for symmetry with
 * pathfinding APIs that may charge diagonal movement extra.
 *
 * Overlays:
 *   - `blocksMovement === true`               → +Infinity (impassable)
 *   - `kind === "blocked"`                    → +Infinity (alias)
 *   - `biome` override resolves through the realm's MapConfig
 *
 * Otherwise the destination biome's `traversal` class drives the cost.
 */
export function getTraversalCost(
  from: Coord,
  to: Coord,
  opts: { overlays?: TileOverlay[]; diagonalCost?: number } = {},
): number {
  const overlay = opts.overlays?.find((o) =>
    o.x === to.x && o.y === to.y && o.z === to.z && realmOf(o) === realmOf(to)
  );
  if (overlay?.blocksMovement === true) return Number.POSITIVE_INFINITY;
  if (overlay?.kind === "blocked") return Number.POSITIVE_INFINITY;

  const cfg = getMapConfig(realmOf(to));
  const lookup = biomeLookupFor(cfg, realmOf(to));
  let biome: BiomeDefinition;
  if (overlay?.biome) {
    biome = cfg.biomes.find((b) => b.id === overlay.biome) ?? lookup.biomeAt(to);
  } else {
    biome = lookup.biomeAt(to);
  }
  const base = biome.traversal ? TRAVERSAL_COST[biome.traversal] : 1;
  if (!Number.isFinite(base)) return base;
  const isDiagonal = from.x !== to.x && from.y !== to.y;
  return isDiagonal ? base * (opts.diagonalCost ?? 1) : base;
}

// ─── A* ──────────────────────────────────────────────────────────────────────

export interface FindPathOptions {
  /** Overlays to honor for blocked tiles / authored biomes. */
  overlays?: TileOverlay[];
  /** Hard cap on total path cost. Default: 256. */
  maxCost?: number;
  /** Hard cap on iterations to bound search. Default: 4096. */
  maxIterations?: number;
  /** Caller-supplied filter: returning true excludes the coord. */
  avoid?: (c: Coord) => boolean;
  /** Allow diagonal moves. Default true. */
  diagonal?: boolean;
  /** Cost multiplier for diagonal steps. Default `Math.SQRT2`. */
  diagonalCost?: number;
}

interface Node {
  coord: Coord;
  g: number;
  f: number;
  parentKey: string | null;
}

function neighbors(c: Coord, diagonal: boolean): Coord[] {
  const out: Coord[] = [];
  const offsets: Array<[number, number]> = diagonal
    ? [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]
    : [[1, 0], [-1, 0], [0, 1], [0, -1]];
  for (const [dx, dy] of offsets) {
    const n: Coord = { x: c.x + dx, y: c.y + dy, z: c.z };
    if (c.realm !== undefined) n.realm = c.realm;
    out.push(n);
  }
  return out;
}

function heuristic(a: Coord, b: Coord, diagonal: boolean): number {
  const dx = Math.abs(a.x - b.x);
  const dy = Math.abs(a.y - b.y);
  return diagonal
    ? Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy)
    : dx + dy;
}

const ckey = (c: Coord): string => `${realmOf(c)}:${c.x},${c.y},${c.z}`;

/**
 * A* on the grid. Returns the inclusive coord sequence from → to or `null` if
 * no path exists within `maxCost`/`maxIterations`. Diagonals optional.
 */
export function findPath(
  from: Coord,
  to: Coord,
  opts: FindPathOptions = {},
): Coord[] | null {
  if (realmOf(from) !== realmOf(to) || from.z !== to.z) return null;
  const maxCost = opts.maxCost ?? 256;
  const maxIters = opts.maxIterations ?? 4096;
  const diagonal = opts.diagonal !== false;
  const diagonalCost = opts.diagonalCost ?? Math.SQRT2;
  const avoid = opts.avoid;

  const start: Node = { coord: from, g: 0, f: heuristic(from, to, diagonal), parentKey: null };
  const open = new Map<string, Node>();
  const closed = new Map<string, Node>();
  open.set(ckey(from), start);

  let iters = 0;
  while (open.size > 0) {
    if (++iters > maxIters) return null;
    // Pop lowest-f node.
    let bestKey: string | null = null;
    let bestNode: Node | null = null;
    for (const [k, n] of open) {
      if (!bestNode || n.f < bestNode.f) { bestKey = k; bestNode = n; }
    }
    if (!bestKey || !bestNode) return null;
    open.delete(bestKey);
    closed.set(bestKey, bestNode);

    if (bestNode.coord.x === to.x && bestNode.coord.y === to.y) {
      // Reconstruct path.
      const path: Coord[] = [];
      let cur: Node | undefined = bestNode;
      while (cur) {
        path.push(cur.coord);
        cur = cur.parentKey ? closed.get(cur.parentKey) : undefined;
      }
      return path.reverse();
    }

    for (const n of neighbors(bestNode.coord, diagonal)) {
      const nk = ckey(n);
      if (closed.has(nk)) continue;
      if (avoid && avoid(n)) continue;
      const step = getTraversalCost(bestNode.coord, n, {
        overlays: opts.overlays,
        diagonalCost,
      });
      if (!Number.isFinite(step)) continue;
      const tentativeG = bestNode.g + step;
      if (tentativeG > maxCost) continue;
      const existing = open.get(nk);
      if (existing && existing.g <= tentativeG) continue;
      open.set(nk, {
        coord: n,
        g: tentativeG,
        f: tentativeG + heuristic(n, to, diagonal),
        parentKey: bestKey,
      });
    }
  }
  return null;
}
