/**
 * Weighted BFS/Dijkstra for zone wander and hunter pathing.
 * Host supplies adjacency (exits); engine never touches the DB.
 */

export interface PathfindOptions {
  /** BFS / Dijkstra depth cap. Default 6. */
  maxDepth?: number;
  /**
   * Cost to enter a room (default 1). Use Infinity to block.
   * Goal room is always traversable regardless of cost.
   */
  costOf?: (roomId: string) => Promise<number>;
  /**
   * Adjacent room ids from `roomId`. Required unless a default
   * adjacency provider was set via setDefaultAdjacency.
   */
  getAdjacent?: (roomId: string) => Promise<string[]>;
}

let _defaultAdjacent:
  | ((roomId: string) => Promise<string[]>)
  | null = null;

/** Optional host default for nextHopToward without per-call getAdjacent. */
export function setDefaultAdjacency(
  fn: ((roomId: string) => Promise<string[]>) | null,
): void {
  _defaultAdjacent = fn;
}

export function getDefaultAdjacency():
  | ((roomId: string) => Promise<string[]>)
  | null {
  return _defaultAdjacent;
}

/**
 * Next room hop toward goal within allowedRoomIds.
 * 4th arg: maxDepth number (legacy) or PathfindOptions.
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
  const getAdjacent = opts.getAdjacent ?? _defaultAdjacent;
  if (!getAdjacent) {
    throw new Error(
      "[@ursamu/combat] nextHopToward needs getAdjacent " +
        "or setDefaultAdjacency()",
    );
  }
  const rawCostOf = opts.costOf ?? (() => Promise.resolve(1));

  const costCache = new Map<string, number>();
  const costOf = async (rid: string): Promise<number> => {
    const cached = costCache.get(rid);
    if (cached !== undefined) return cached;
    const v = await rawCostOf(rid);
    costCache.set(rid, v);
    return v;
  };

  const MAX_VISITED = 100;
  const allowed = new Set(allowedRoomIds);
  const dist = new Map<string, number>([[fromRoomId, 0]]);
  const parent = new Map<string, string>();
  const depth = new Map<string, number>([[fromRoomId, 0]]);
  const closed = new Set<string>();
  const open: string[] = [fromRoomId];

  while (open.length > 0) {
    open.sort(
      (a, b) =>
        (dist.get(a) ?? Infinity) - (dist.get(b) ?? Infinity),
    );
    const cur = open.shift()!;
    if (closed.has(cur)) continue;
    closed.add(cur);
    if (dist.size > MAX_VISITED) return null;
    const d = depth.get(cur) ?? 0;
    if (d >= maxDepth) continue;
    if (cur === goalRoomId) break;

    const neighbors = await getAdjacent(cur);
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

  let step = goalRoomId;
  while (parent.get(step) && parent.get(step) !== fromRoomId) {
    step = parent.get(step)!;
  }
  return step;
}
