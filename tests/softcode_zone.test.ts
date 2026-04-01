/**
 * tests/softcode_zone.test.ts
 *
 * Unit tests for @zone zone master logic.
 * Tests membership management (add/del/purge/replace/list) using an in-memory stub.
 */
import { assertEquals } from "@std/assert";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

// ── Inline zone membership store ───────────────────────────────────────────

interface IZone { id: string; zmId: string; memberId: string; }

function makeZoneStore() {
  const store: IZone[] = [];

  return {
    add(zmId: string, memberId: string): boolean {
      const key = `${zmId}:${memberId}`;
      if (store.some(z => z.id === key)) return false; // already exists
      store.push({ id: key, zmId, memberId });
      return true;
    },
    del(zmId: string, memberId: string): boolean {
      const key = `${zmId}:${memberId}`;
      const i = store.findIndex(z => z.id === key);
      if (i === -1) return false;
      store.splice(i, 1);
      return true;
    },
    purge(objectId: string): number {
      const before = store.length;
      store.splice(0, store.length, ...store.filter(z => z.zmId !== objectId && z.memberId !== objectId));
      return before - store.length;
    },
    replace(memberId: string, oldZmId: string, newZmId: string): boolean {
      const oldKey = `${oldZmId}:${memberId}`;
      const i = store.findIndex(z => z.id === oldKey);
      if (i === -1) return false;
      store.splice(i, 1);
      const newKey = `${newZmId}:${memberId}`;
      store.push({ id: newKey, zmId: newZmId, memberId });
      return true;
    },
    membersOf(zmId: string): string[] {
      return store.filter(z => z.zmId === zmId).map(z => z.memberId);
    },
    zonesOf(memberId: string): string[] {
      return store.filter(z => z.memberId === memberId).map(z => z.zmId);
    },
    isMember(zmId: string, memberId: string): boolean {
      return store.some(z => z.id === `${zmId}:${memberId}`);
    },
    size(): number { return store.length; },
  };
}

// ── @zone/add tests ────────────────────────────────────────────────────────

Deno.test("@zone/add — adds object to zone master", OPTS, () => {
  const s = makeZoneStore();
  const ok = s.add("zm1", "obj1");
  assertEquals(ok, true);
  assertEquals(s.isMember("zm1", "obj1"), true);
});

Deno.test("@zone/add — duplicate add returns false", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  assertEquals(s.add("zm1", "obj1"), false);
  assertEquals(s.size(), 1); // no duplicate stored
});

Deno.test("@zone/add — object can belong to multiple zones", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  s.add("zm2", "obj1");
  assertEquals(s.zonesOf("obj1").sort(), ["zm1", "zm2"]);
});

// ── @zone/del tests ────────────────────────────────────────────────────────

Deno.test("@zone/del — removes membership", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  const ok = s.del("zm1", "obj1");
  assertEquals(ok, true);
  assertEquals(s.isMember("zm1", "obj1"), false);
});

Deno.test("@zone/del — returns false if not member", OPTS, () => {
  const s = makeZoneStore();
  assertEquals(s.del("zm1", "obj1"), false);
});

Deno.test("@zone/del — only removes target membership, not others", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  s.add("zm1", "obj2");
  s.del("zm1", "obj1");
  assertEquals(s.isMember("zm1", "obj2"), true);
});

// ── @zone/purge tests ──────────────────────────────────────────────────────

Deno.test("@zone/purge — removes all memberships for object", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "target");
  s.add("zm2", "target");
  s.add("zm1", "other"); // unrelated
  const removed = s.purge("target");
  assertEquals(removed, 2);
  assertEquals(s.size(), 1); // only zm1:other remains
});

Deno.test("@zone/purge — removing a zone master removes all its members", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  s.add("zm1", "obj2");
  s.add("zm2", "obj1"); // unrelated
  const removed = s.purge("zm1");
  assertEquals(removed, 2);
  assertEquals(s.size(), 1); // only zm2:obj1 remains
});

Deno.test("@zone/purge — purging non-member returns 0", OPTS, () => {
  const s = makeZoneStore();
  assertEquals(s.purge("nobody"), 0);
});

// ── @zone/replace tests ────────────────────────────────────────────────────

Deno.test("@zone/replace — swaps zone master", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  const ok = s.replace("obj1", "zm1", "zm2");
  assertEquals(ok, true);
  assertEquals(s.isMember("zm1", "obj1"), false);
  assertEquals(s.isMember("zm2", "obj1"), true);
});

Deno.test("@zone/replace — returns false when not in old zone", OPTS, () => {
  const s = makeZoneStore();
  assertEquals(s.replace("obj1", "zm1", "zm2"), false);
});

// ── @zone/list tests ───────────────────────────────────────────────────────

Deno.test("@zone/list — list members of a zone master", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "obj1");
  s.add("zm1", "obj2");
  s.add("zm2", "obj3"); // different ZM
  assertEquals(s.membersOf("zm1").sort(), ["obj1", "obj2"]);
});

Deno.test("@zone/list — list zones of a member", OPTS, () => {
  const s = makeZoneStore();
  s.add("zm1", "me");
  s.add("zm2", "me");
  assertEquals(s.zonesOf("me").sort(), ["zm1", "zm2"]);
});

Deno.test("@zone/list — non-member shows empty list", OPTS, () => {
  const s = makeZoneStore();
  assertEquals(s.membersOf("zm1"), []);
  assertEquals(s.zonesOf("nobody"), []);
});
