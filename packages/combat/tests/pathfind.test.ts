import { assertEquals, assertRejects } from "@std/assert";
import {
  nextHopToward,
  setDefaultAdjacency,
} from "../src/pathfind.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function graph(
  edges: Array<[string, string]>,
): (from: string) => Promise<string[]> {
  const m = new Map<string, string[]>();
  for (const [a, b] of edges) {
    if (!m.has(a)) m.set(a, []);
    m.get(a)!.push(b);
  }
  return (from) => Promise.resolve(m.get(from) ?? []);
}

Deno.test("nextHopToward first hop on direct path", OPTS, async () => {
  const hop = await nextHopToward("A", "C", ["A", "B", "C"], {
    getAdjacent: graph([["A", "B"], ["B", "C"]]),
  });
  assertEquals(hop, "B");
});

Deno.test("nextHopToward null when from === goal", OPTS, async () => {
  const hop = await nextHopToward("A", "A", ["A", "B"], {
    getAdjacent: graph([["A", "B"]]),
  });
  assertEquals(hop, null);
});

Deno.test("nextHopToward respects allowedRoomIds", OPTS, async () => {
  const hop = await nextHopToward("A", "C", ["A", "B", "C"], {
    getAdjacent: graph([
      ["A", "B"],
      ["A", "X"],
      ["X", "C"],
      ["B", "C"],
    ]),
  });
  assertEquals(hop, "B");
});

Deno.test("nextHopToward unreachable goal", OPTS, async () => {
  const hop = await nextHopToward("A", "Z", ["A", "B"], {
    getAdjacent: graph([["A", "B"]]),
  });
  assertEquals(hop, null);
});

Deno.test("nextHopToward routes around high cost", OPTS, async () => {
  const hop = await nextHopToward("A", "D", ["A", "B", "X", "D"], {
    getAdjacent: graph([
      ["A", "B"],
      ["B", "D"],
      ["A", "X"],
      ["X", "D"],
    ]),
    costOf: (rid) => Promise.resolve(rid === "X" ? 1000 : 1),
  });
  assertEquals(hop, "B");
});

Deno.test("nextHopToward Infinity cost blocks room", OPTS, async () => {
  const hop = await nextHopToward("A", "D", ["A", "B", "X", "D"], {
    getAdjacent: graph([
      ["A", "B"],
      ["B", "D"],
      ["A", "X"],
      ["X", "D"],
    ]),
    costOf: (rid) => Promise.resolve(rid === "B" ? Infinity : 1),
  });
  assertEquals(hop, "X");
});

Deno.test("nextHopToward honors maxDepth", OPTS, async () => {
  const adj = graph([
    ["A", "B"],
    ["B", "C"],
    ["C", "D"],
    ["D", "E"],
  ]);
  const hop = await nextHopToward("A", "E", ["A", "B", "C", "D", "E"], {
    maxDepth: 2,
    getAdjacent: adj,
  });
  assertEquals(hop, null);
  const hop2 = await nextHopToward("A", "E", ["A", "B", "C", "D", "E"], {
    maxDepth: 6,
    getAdjacent: adj,
  });
  assertEquals(hop2, "B");
});

Deno.test("nextHopToward uses default adjacency", OPTS, async () => {
  setDefaultAdjacency(graph([["A", "B"], ["B", "C"]]));
  try {
    const hop = await nextHopToward("A", "C", ["A", "B", "C"], 6);
    assertEquals(hop, "B");
  } finally {
    setDefaultAdjacency(null);
  }
});

Deno.test("nextHopToward throws without adjacency", OPTS, async () => {
  setDefaultAdjacency(null);
  await assertRejects(
    () => nextHopToward("A", "B", ["A", "B"], 6),
    Error,
    "getAdjacent",
  );
});
