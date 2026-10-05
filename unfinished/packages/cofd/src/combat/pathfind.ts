// CofD façade: pathfind lives in @ursamu/combat; adjacency from exits.

import {
  nextHopToward as coreNextHop,
  type PathfindOptions as CoreOpts,
} from "@ursamu/combat";
import { findAdjacentRooms } from "./zone.ts";

export interface PathfindOptions {
  maxDepth?: number;
  costOf?: (roomId: string) => Promise<number>;
}

/**
 * Next hop toward goal within allowed rooms. Uses zone exit graph.
 * 4th arg: maxDepth number (legacy) or PathfindOptions.
 */
export async function nextHopToward(
  fromRoomId: string,
  goalRoomId: string,
  allowedRoomIds: string[],
  optsOrDepth: PathfindOptions | number = 6,
): Promise<string | null> {
  const base: CoreOpts = typeof optsOrDepth === "number"
    ? { maxDepth: optsOrDepth }
    : { maxDepth: optsOrDepth.maxDepth, costOf: optsOrDepth.costOf };
  return await coreNextHop(fromRoomId, goalRoomId, allowedRoomIds, {
    ...base,
    getAdjacent: findAdjacentRooms,
  });
}
