/**
 * tests/sdk_physics_exports.test.ts
 *
 * Tests for the pure TS exports of the physics primitives
 * (vreflect, pointInAabb, rayAabb). External plugin consumers
 * import these directly without going through the softcode engine.
 */
// deno-lint-ignore-file require-await
import { assertEquals, assertStrictEquals } from "@std/assert";
import {
  pointInAabb,
  rayAabb,
  vreflect,
} from "../src/services/Softcode/stdlib/physics.ts";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";
import type { DbAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

// ── vreflect ──────────────────────────────────────────────────────────────

Deno.test("vreflect — bounce off floor", () => {
  assertEquals(vreflect([1, -1, 0], [0, 1, 0]), [1, 1, 0]);
});

Deno.test("vreflect — incident parallel to normal flips direction", () => {
  assertEquals(vreflect([0, -1, 0], [0, 1, 0]), [0, 1, 0]);
});

Deno.test("vreflect — perpendicular to normal is unchanged", () => {
  assertEquals(vreflect([1, 0, 0], [0, 1, 0]), [1, 0, 0]);
});

// ── pointInAabb ───────────────────────────────────────────────────────────

Deno.test("pointInAabb — center of unit cube is inside", () => {
  assertStrictEquals(pointInAabb([0.5, 0.5, 0.5], [0, 0, 0], [1, 1, 1]), true);
});

Deno.test("pointInAabb — corner exactly on min is inside (inclusive)", () => {
  assertStrictEquals(pointInAabb([0, 0, 0], [0, 0, 0], [1, 1, 1]), true);
});

Deno.test("pointInAabb — epsilon outside a face is outside", () => {
  assertStrictEquals(
    pointInAabb([1 + 1e-6, 0.5, 0.5], [0, 0, 0], [1, 1, 1]),
    false,
  );
});

Deno.test("pointInAabb — empty box (min > max) is always outside", () => {
  assertStrictEquals(pointInAabb([0, 0, 0], [1, 0, 0], [0, 1, 1]), false);
});

// ── rayAabb ───────────────────────────────────────────────────────────────

Deno.test("rayAabb — hit from outside returns positive t", () => {
  assertStrictEquals(
    rayAabb([0, 0, 0], [1, 0, 0], [5, -1, -1], [6, 1, 1]),
    5,
  );
});

Deno.test("rayAabb — parallel offset misses, returns -1", () => {
  // ray along +x at y=5, box at y in [-1,1] — never hits.
  assertStrictEquals(
    rayAabb([0, 5, 0], [1, 0, 0], [5, -1, -1], [6, 1, 1]),
    -1,
  );
});

Deno.test("rayAabb — origin inside the box returns 0", () => {
  assertStrictEquals(
    rayAabb([0, 0, 0], [1, 0, 0], [-1, -1, -1], [1, 1, 1]),
    0,
  );
});

Deno.test("rayAabb — pointing away from the box returns -1", () => {
  assertStrictEquals(
    rayAabb([0, 0, 0], [-1, 0, 0], [5, -1, -1], [6, 1, 1]),
    -1,
  );
});

Deno.test("rayAabb — axis-parallel grazing a face returns small positive t", () => {
  // ray at y=1 (top face) traveling +x — grazes box top, slab math returns t=5.
  const t = rayAabb([0, 1, 0], [1, 0, 0], [5, -1, -1], [6, 1, 1]);
  assertStrictEquals(t, 5);
});

// ── parity: TS vreflect matches softcode [vreflect(...)] ──────────────────

function actor(): IDBObj {
  return {
    id: "100",
    name: "Alice",
    flags: new Set(["player", "connected"]),
    location: "200",
    state: {},
    contents: [],
  };
}

function makeCtx(): UrsaEvalContext {
  const a = actor();
  return {
    enactor:      a.id,
    executor:     a,
    caller:       null,
    actor:        a,
    args:         [],
    registers:    new Map(),
    iterStack:    [],
    depth:        0,
    maxDepth:     50,
    maxOutputLen: 65_536,
    deadline:     Date.now() + 2000,
    db: {
      queryById:        async () => null,
      queryByName:      async () => null,
      lcon:             async () => [],
      lwho:             async () => [],
      lattr:            async () => [],
      getAttribute:     async () => null,
      getTagById:       async () => null,
      getPlayerTagById: async () => null,
      lsearch:          async () => [],
      children:         async () => [],
      lchannels:        async () => "",
      channelsFor:      async () => "",
      mailCount:        async () => 0,
      queueLength:      async () => 0,
      getIdleSecs:      async () => 0,
      getUserFn:        async () => null,
    } satisfies DbAccessor,
    output:       { send: () => {}, roomBroadcast: () => {}, broadcast: () => {} },
    _engine:      softcodeEngine,
  };
}

Deno.test("parity — softcode vreflect equals TS vreflect joined by spaces", async () => {
  const softcodeResult = await runSoftcode("[vreflect(1 -1 0,0 1 0)]", makeCtx());
  const tsResult = vreflect([1, -1, 0], [0, 1, 0]).join(" ");
  assertEquals(softcodeResult, tsResult);
});
