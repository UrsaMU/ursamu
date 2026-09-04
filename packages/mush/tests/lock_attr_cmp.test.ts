/**
 * attr() lockfunc comparisons and colon-form attr:>N.
 */
import { assertEquals } from "@std/assert";
import { evaluateLock } from "../src/world/locks.ts";
import type { IDBObj } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function actor(state: Record<string, unknown>): IDBObj {
  return {
    id: "la1",
    name: "LockActor",
    flags: new Set(["player", "connected"]),
    state,
    contents: [],
  };
}

Deno.test("attr(name): presence only", OPTS, async () => {
  const a = actor({ level: 3, tribe: "glass" });
  assertEquals(await evaluateLock("attr(level)", a, a), true);
  assertEquals(await evaluateLock("attr(missing)", a, a), false);
});

Deno.test("attr(name, val): equality", OPTS, async () => {
  const a = actor({ tribe: "glasswalker" });
  assertEquals(
    await evaluateLock("attr(tribe, glasswalker)", a, a),
    true,
  );
  assertEquals(
    await evaluateLock("attr(tribe, silverfang)", a, a),
    false,
  );
});

Deno.test("attr(name, >N) comparisons", OPTS, async () => {
  const a = actor({ level: 5, xp: "12" });
  assertEquals(await evaluateLock("attr(level,>4)", a, a), true);
  assertEquals(await evaluateLock("attr(level,>5)", a, a), false);
  assertEquals(await evaluateLock("attr(level,>=5)", a, a), true);
  assertEquals(await evaluateLock("attr(level,<6)", a, a), true);
  assertEquals(await evaluateLock("attr(level,<=5)", a, a), true);
  assertEquals(await evaluateLock("attr(xp,>=10)", a, a), true);
  assertEquals(await evaluateLock("attr(xp,<10)", a, a), false);
});

Deno.test("attr case-insensitive key", OPTS, async () => {
  const a = actor({ Tribe: "glass" });
  assertEquals(await evaluateLock("attr(tribe)", a, a), true);
  assertEquals(
    await evaluateLock("attr(TRIBE, glass)", a, a),
    true,
  );
});

Deno.test("colon form level:>4 still works", OPTS, async () => {
  const a = actor({ level: 5 });
  assertEquals(await evaluateLock("level:>4", a, a), true);
  assertEquals(await evaluateLock("level:<5", a, a), false);
  assertEquals(await evaluateLock("level:5", a, a), true);
});
