/**
 * tests/security_grep_parent_depth.test.ts
 *
 * [SEC][L3] @grep /parent — unbounded parent chain traversal (DoS).
 *
 * collectWithParents() has no depth cap. A deeply nested parent chain
 * (e.g. 1000 objects) causes 1000 sequential DB lookups in one command,
 * degrading server performance (slow DoS).
 *
 * RED:  Show that collectWithParents (inline) traverses all N parents with
 *       no limit, visiting N+1 objects for a chain of depth N.
 *
 * GREEN: A MAX_PARENT_DEPTH cap of 50 stops the traversal after that many hops,
 *        returning at most 51 objects (root + 50 parents).
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

interface FakeObj { id: string; attrs: string[]; parentId?: string; }

// Inline the current collectWithParents logic (no depth cap)
async function collectWithParents_CURRENT(
  obj: FakeObj | null,
  visited = new Set<string>(),
  db: Map<string, FakeObj>,
): Promise<string[]> {
  if (!obj || visited.has(obj.id)) return [];
  visited.add(obj.id);
  const results: string[] = [obj.id];
  if (obj.parentId) {
    const parent = db.get(obj.parentId) ?? null;
    if (parent) results.push(...await collectWithParents_CURRENT(parent, visited, db));
  }
  return results;
}

const MAX_PARENT_DEPTH = 50;

// Fixed version: caps traversal at MAX_PARENT_DEPTH
async function collectWithParents_FIXED(
  obj: FakeObj | null,
  db: Map<string, FakeObj>,
  visited = new Set<string>(),
  depth = 0,
): Promise<string[]> {
  if (!obj || visited.has(obj.id) || depth > MAX_PARENT_DEPTH) return [];
  visited.add(obj.id);
  const results: string[] = [obj.id];
  if (obj.parentId) {
    const parent = db.get(obj.parentId) ?? null;
    if (parent) results.push(...await collectWithParents_FIXED(parent, db, visited, depth + 1));
  }
  return results;
}

// Build a linear parent chain of given depth
function buildChain(depth: number): { root: FakeObj; db: Map<string, FakeObj> } {
  const db = new Map<string, FakeObj>();
  let current: FakeObj = { id: `obj-${depth}`, attrs: [] };
  db.set(current.id, current);
  for (let i = depth - 1; i >= 0; i--) {
    const parent: FakeObj = { id: `obj-${i}`, attrs: [], parentId: current.id };
    db.set(parent.id, parent);
    current = parent;
  }
  // current is now the root (obj-0) pointing down the chain
  // But we want root.parentId to be obj-1... reverse the chain:
  // Re-build: root → parent1 → parent2 → … → leaf
  const db2 = new Map<string, FakeObj>();
  const root: FakeObj = { id: "root", attrs: [] };
  db2.set("root", root);
  let prev = root;
  for (let i = 1; i <= depth; i++) {
    const node: FakeObj = { id: `node-${i}`, attrs: [] };
    db2.set(node.id, node);
    prev.parentId = node.id;
    prev = node;
  }
  return { root, db: db2 };
}

// ── RED ───────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L3] RED: current collectWithParents traverses entire chain (no depth limit)", OPTS, async () => {
  const depth = 100; // 100-deep chain
  const { root, db } = buildChain(depth);

  const visited = await collectWithParents_CURRENT(root, new Set(), db);
  // Should visit root + 100 parents = 101 objects — no cap
  assertEquals(visited.length, depth + 1, `FLAW: traversed all ${depth + 1} objects without limit`);
});

// ── GREEN ─────────────────────────────────────────────────────────────────────

Deno.test("[SEC][L3] GREEN: fixed collectWithParents stops at MAX_PARENT_DEPTH", OPTS, async () => {
  const depth = 100;
  const { root, db } = buildChain(depth);

  const visited = await collectWithParents_FIXED(root, db);
  // Should stop at MAX_PARENT_DEPTH + 1 (root + 50 parents)
  assertEquals(visited.length, MAX_PARENT_DEPTH + 1, `FIXED: capped at ${MAX_PARENT_DEPTH + 1} objects`);
});

Deno.test("[SEC][L3] GREEN: fixed traverses short chain fully (depth < MAX)", OPTS, async () => {
  const depth = 10;
  const { root, db } = buildChain(depth);
  const visited = await collectWithParents_FIXED(root, db);
  assertEquals(visited.length, depth + 1);
});

Deno.test("[SEC][L3] GREEN: cycle protection still works with depth cap", OPTS, async () => {
  // Create a cycle: A → B → A
  const db = new Map<string, FakeObj>();
  const A: FakeObj = { id: "A", attrs: [], parentId: "B" };
  const B: FakeObj = { id: "B", attrs: [], parentId: "A" };
  db.set("A", A);
  db.set("B", B);

  const visited = await collectWithParents_FIXED(A, db);
  assertEquals(visited.length, 2, "cycle stopped by visited set");
});
