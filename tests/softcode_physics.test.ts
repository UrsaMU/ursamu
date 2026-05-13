/**
 * tests/softcode_physics.test.ts
 *
 * Unit tests for the physics-primitives stdlib functions
 * (vreflect, pointinaabb, rayaabb) introduced in v2.5.0 phase C.
 */
// deno-lint-ignore-file require-await
import { assertEquals } from "@std/assert";
import { runSoftcode, softcodeEngine } from "../src/services/Softcode/ursamu-engine.ts";
import type { UrsaEvalContext } from "../src/services/Softcode/ursamu-context.ts";
import type { DbAccessor } from "../src/services/Softcode/context.ts";
import type { IDBObj } from "../src/@types/UrsamuSDK.ts";

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

function run(code: string): Promise<string> {
  return runSoftcode(code, makeCtx());
}

// ── vreflect ──────────────────────────────────────────────────────────────

Deno.test("physics/vreflect — bounce off floor (1 -1 0) off (0 1 0)", async () => {
  assertEquals(await run("[vreflect(1 -1 0,0 1 0)]"), "1 1 0");
});

Deno.test("physics/vreflect — incident along normal (0 -1 0) off (0 1 0)", async () => {
  assertEquals(await run("[vreflect(0 -1 0,0 1 0)]"), "0 1 0");
});

Deno.test("physics/vreflect — perpendicular (1 0 0) off (0 1 0) unchanged", async () => {
  assertEquals(await run("[vreflect(1 0 0,0 1 0)]"), "1 0 0");
});

// ── pointinaabb ───────────────────────────────────────────────────────────

Deno.test("physics/pointinaabb — center of unit cube inside", async () => {
  assertEquals(await run("[pointinaabb(0.5,0.5,0.5,0,0,0,1,1,1)]"), "1");
});

Deno.test("physics/pointinaabb — corner on min inside (boundary inclusive)", async () => {
  assertEquals(await run("[pointinaabb(0,0,0,0,0,0,1,1,1)]"), "1");
});

Deno.test("physics/pointinaabb — corner on max inside (boundary inclusive)", async () => {
  assertEquals(await run("[pointinaabb(1,1,1,0,0,0,1,1,1)]"), "1");
});

Deno.test("physics/pointinaabb — just outside a face", async () => {
  assertEquals(await run("[pointinaabb(1.0001,0.5,0.5,0,0,0,1,1,1)]"), "0");
});

Deno.test("physics/pointinaabb — empty box (min > max) → outside", async () => {
  assertEquals(await run("[pointinaabb(0.5,0.5,0.5,1,1,1,0,0,0)]"), "0");
});

// ── rayaabb ───────────────────────────────────────────────────────────────

Deno.test("physics/rayaabb — ray hits center of unit cube from -X axis", async () => {
  assertEquals(await run("[rayaabb(-5,0.5,0.5,1,0,0,0,0,0,1,1,1)]"), "5");
});

Deno.test("physics/rayaabb — parallel ray offset from box misses", async () => {
  assertEquals(await run("[rayaabb(0,2,0.5,1,0,0,0,0,0,1,1,1)]"), "-1");
});

Deno.test("physics/rayaabb — origin inside box returns 0", async () => {
  assertEquals(await run("[rayaabb(0.5,0.5,0.5,1,0,0,0,0,0,1,1,1)]"), "0");
});

Deno.test("physics/rayaabb — ray pointing away from box returns -1", async () => {
  assertEquals(await run("[rayaabb(-5,0.5,0.5,-1,0,0,0,0,0,1,1,1)]"), "-1");
});

Deno.test("physics/rayaabb — axis-parallel ray grazing a face", async () => {
  assertEquals(await run("[rayaabb(-0.5,0,0.5,1,0,0,0,0,0,1,1,1)]"), "0.5");
});

Deno.test("physics/rayaabb — diagonal ray entering through corner", async () => {
  assertEquals(await run("[rayaabb(-1,-1,-1,1,1,1,0,0,0,1,1,1)]"), "1");
});
