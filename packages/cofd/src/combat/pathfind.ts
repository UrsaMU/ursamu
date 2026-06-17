// BFS / weighted pathfinding for zone wander logic. Hunter-aggro mobs use
// this to step toward distant active encounters within their zone.
//
// Two APIs:
//   nextHopToward(from, goal, allowed, maxDepth?)          shortest-hop BFS
//   nextHopToward(from, goal, allowed, { maxDepth, costOf }) weighted Dijkstra
//
// costOf returns the step cost to enter a room (default 1). Use Infinity
// to make a room unreachable; the path will route around it. Used by the
// wander tick to make hunters avoid rooms with unrelated active combat.

import { findAdjacentRooms } from "./zone.ts";

export interface PathfindOptions {
  /** BFS / Dijkstra depth cap to bound compute. Default 6. */
  maxDepth?: number;
  /**
   * Per-room step cost. Default 1. Use Infinity to make a room avoid-only.
   * The goal room is always traversable regardless of its cost.
   */
  costOf?: (roomId: string) => Promise<number>;
}

/**
 * Find the next room a mob should step toward to reach `goalRoomId`,
 * restricted to `allowedRoomIds`. Returns the FIRST hop room id, not the
 * full path. Returns null if no path exists within the cap.
 *
 * 4th arg can be a maxDepth number (legacy) or a PathfindOptions object.
 */
export async function nextHopToward(
  fromRoomId: string,
  goalRoomId: string,
  allowedRoomIds: string[],
  optsOrDepth: PathfindOptions | number = 6,
): Promise<string | null> {
  if (fromRoomId === goalRoomId) return null;

  const opts: PathfindOptions = typeof optsOrDepth === "number"
    ? { maxDepth: optsOrDepth }
    : optsOrDepth;
  const maxDepth = opts.maxDepth ?? 6;
  const rawCostOf = opts.costOf ?? (() => Promise.resolve(1));

  // M1: memoize costOf so repeated visits to the same room don't reissue
  // DBO calls under the hood (roomHasActiveEncounter is the common cost).
  const costCache = new Map<string, number>();
  const costOf = async (rid: string): Promise<number> => {
    const cached = costCache.get(rid);
    if (cached !== undefined) return cached;
    const v = await rawCostOf(rid);
    costCache.set(rid, v);
    return v;
  };

  // Cap visited nodes to bound per-tick DBO query cost. 100 covers any
  // realistic single-zone graph and the depth cap also bounds reach.
  const MAX_VISITED = 100;

  const allowed = new Set(allowedRoomIds);
  const dist = new Map<string, number>([[fromRoomId, 0]]);
  const parent = new Map<string, string>();
  const depth = new Map<string, number>([[fromRoomId, 0]]);
  // M2: closed set prevents re-processing of finalized nodes (standard
  // Dijkstra). With a closed set the algorithm is O(V log V) instead of
  // potentially quadratic in pathological cycles.
  const closed = new Set<string>();

  const open: string[] = [fromRoomId];

  while (open.length > 0) {
    open.sort((a, b) => (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity));
    const cur = open.shift()!;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (dist.size > MAX_VISITED) return null;
    const d = depth.get(cur) ?? 0;
    if (d >= maxDepth) continue;

    if (cur === goalRoomId) break;

    const neighbors = await findAdjacentRooms(cur);
    for (const n of neighbors) {
      if (closed.has(n)) continue;
      if (!allowed.has(n)) continue;
      const step = n === goalRoomId ? 1 : await costOf(n);
      if (!Number.isFinite(step)) continue;
      const cand = (dist.get(cur) ?? Infinity) + step;
      if (cand < (dist.get(n) ?? Infinity)) {
        dist.set(n, cand);
        parent.set(n, cur);
        depth.set(n, d + 1);
        if (!open.includes(n)) open.push(n);
      }
    }
  }

  if (!parent.has(goalRoomId)) return null;

  // Walk parents back to find the first hop (room adjacent to fromRoomId).
  let step = goalRoomId;
  while (parent.get(step) && parent.get(step) !== fromRoomId) {
    step = parent.get(step)!;
  }
  return step;
}
