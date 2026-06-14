// Unit tests for the BFS pathfinder used by hunter-aggro mobs.
//
// nextHopToward calls findAdjacentRooms from zone.ts which queries dbojs.
// To test in isolation we monkey-patch the engine's dbojs.query for the
// duration of the test.

import { assertEquals } from "@std/assert";
import { nextHopToward } from "../src/combat/pathfind.ts";
import { dbojs } from "@ursamu/ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface Exit { id: string; flags: string; location: string; data: { destination: string }; }

function withExitGraph(
  edges: Array<[string, string]>,
  fn: () => Promise<void>,
): Promise<void> {
  // Build exit-object index keyed by source room. We stamp both flat and
  // nested location fields so queryByLocation (which checks both) returns
  // them under either query shape.
  const byRoom = new Map<string, Exit[]>();
  let id = 0;
  for (const [from, to] of edges) {
    const ex: Exit = {
      id: `ex-${++id}`,
      flags: "exit",
      location: from,
      data: { destination: to },
    };
    if (!byRoom.has(from)) byRoom.set(from, []);
    byRoom.get(from)!.push(ex);
  }
  // deno-lint-ignore no-explicit-any
  const original = (dbojs as any).query;
  // deno-lint-ignore no-explicit-any
  (dbojs as any).query = (q: any) => {
    if (!q) return Promise.resolve([]);
    const loc = q.location ?? q["data.location"];
    if (typeof loc === "string") {
      return Promise.resolve(byRoom.get(loc) ?? []);
    }
    return Promise.resolve([]);
  };
  return (async () => {
    try { await fn(); } finally {
      // deno-lint-ignore no-explicit-any
      (dbojs as any).query = original;
    }
  })();
}

Deno.test("nextHopToward returns first hop on direct path", OPTS, () =>
  withExitGraph(
    [["A", "B"], ["B", "C"]],
    async () => {
      const hop = await nextHopToward("A", "C", ["A", "B", "C"], 6);
      assertEquals(hop, "B");
    },
  ));

Deno.test("nextHopToward returns null when from === goal", OPTS, () =>
  withExitGraph(
    [["A", "B"]],
    async () => {
      const hop = await nextHopToward("A", "A", ["A", "B"], 6);
      assertEquals(hop, null);
    },
  ));

Deno.test("nextHopToward respects allowedRoomIds", OPTS, () =>
  withExitGraph(
    [["A", "B"], ["A", "X"], ["X", "C"], ["B", "C"]],
    async () => {
      // Without X allowed, must route via B.
      const hop = await nextHopToward("A", "C", ["A", "B", "C"], 6);
      assertEquals(hop, "B");
    },
  ));

Deno.test("nextHopToward returns null on unreachable goal", OPTS, () =>
  withExitGraph(
    [["A", "B"]],
    async () => {
      const hop = await nextHopToward("A", "Z", ["A", "B"], 6);
      assertEquals(hop, null);
    },
  ));

Deno.test("nextHopToward routes around a high-cost room", OPTS, () =>
  withExitGraph(
    // Two paths from A to D: A-B-D (cost 1+1=2) and A-X-D (1+1=2).
    // Make X expensive so the router prefers B.
    [["A", "B"], ["B", "D"], ["A", "X"], ["X", "D"]],
    async () => {
      const hop = await nextHopToward("A", "D", ["A", "B", "X", "D"], {
        maxDepth: 6,
        costOf: (rid) => Promise.resolve(rid === "X" ? 1000 : 1),
      });
      assertEquals(hop, "B", "should avoid X due to high cost");
    },
  ));

Deno.test("nextHopToward treats Infinity-cost rooms as blocked", OPTS, () =>
  withExitGraph(
    [["A", "B"], ["B", "D"], ["A", "X"], ["X", "D"]],
    async () => {
      const hop = await nextHopToward("A", "D", ["A", "B", "X", "D"], {
        maxDepth: 6,
        costOf: (rid) => Promise.resolve(rid === "B" ? Infinity : 1),
      });
      // B is blocked, so must route via X.
      assertEquals(hop, "X");
    },
  ));

Deno.test("nextHopToward honors maxDepth", OPTS, () =>
  withExitGraph(
    [["A", "B"], ["B", "C"], ["C", "D"], ["D", "E"]],
    async () => {
      // Goal E is depth 4 from A; cap at 2 should fail to find it.
      const hop = await nextHopToward("A", "E", ["A", "B", "C", "D", "E"], 2);
      assertEquals(hop, null);
      // With cap 6 it should find B as the next hop.
      const hop2 = await nextHopToward("A", "E", ["A", "B", "C", "D", "E"], 6);
      assertEquals(hop2, "B");
    },
  ));
