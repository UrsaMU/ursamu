import { assert, assertEquals } from "@std/assert";

import {
  _clearMoveGuards,
  E,
  moveCoord,
  N,
  registerMoveGuard,
  runMoveGuards,
  unregisterMoveGuard,
} from "../move.ts";
import { gameHooks } from "ursamu";
import type {
  BiomeDefinition,
  Coord,
  NeighborhoodSample,
  TopologySample,
} from "../schemas.ts";
import type { TopologyEngine } from "../topology.ts";
import type { IUrsamuSDK } from "ursamu";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function biome(id: string, traversal?: BiomeDefinition["traversal"]): BiomeDefinition {
  return {
    id,
    name: id,
    glyph: id[0] ?? ".",
    phrases: { self: [] },
    traversal,
  };
}

function fakeTopo(b: BiomeDefinition): TopologyEngine {
  const sample = (coord: Coord): TopologySample => ({
    coord, elevation: 0.5, moisture: 0.5, biome: b,
  });
  // deno-lint-ignore no-explicit-any
  const sampleNeighborhood: any = (c: Coord): NeighborhoodSample => ({
    centre: sample(c),
    ring: {
      N: sample(c), NE: sample(c), E: sample(c), SE: sample(c),
      S: sample(c), SW: sample(c), W: sample(c), NW: sample(c),
    },
  });
  return { sample, sampleNeighborhood };
}

function makeSpySDK(): { u: IUrsamuSDK; writes: Array<{ id: string; coord: Coord }> } {
  const writes: Array<{ id: string; coord: Coord }> = [];
  const u = {
    db: {
      // deno-lint-ignore no-explicit-any
      modify: (id: string, _op: string, patch: any) => {
        writes.push({ id, coord: patch["data.coord"] });
        return Promise.resolve();
      },
    },
    // deno-lint-ignore no-explicit-any
  } as any as IUrsamuSDK;
  return { u, writes };
}

function recordHooks(): {
  events: Array<{ name: string; payload: unknown }>;
  detach: () => void;
} {
  const events: Array<{ name: string; payload: unknown }> = [];
  const onMoved = (p: unknown) => events.push({ name: "map:player:moved", payload: p });
  const onBlocked = (p: unknown) => events.push({ name: "map:player:blocked", payload: p });
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on("map:player:moved", onMoved);
  // deno-lint-ignore no-explicit-any
  (gameHooks as any).on("map:player:blocked", onBlocked);
  return {
    events,
    detach: () => {
      // deno-lint-ignore no-explicit-any
      (gameHooks as any).off("map:player:moved", onMoved);
      // deno-lint-ignore no-explicit-any
      (gameHooks as any).off("map:player:blocked", onBlocked);
    },
  };
}

Deno.test("moveCoord: impassable biome blocks with no DB write", OPTS, async () => {
  _clearMoveGuards();
  const { u, writes } = makeSpySDK();
  const hooks = recordHooks();
  const topo = fakeTopo(biome("lava", "impassable"));

  const from: Coord = { x: 0, y: 0, z: 0 };
  const res = await moveCoord(u, "p1", from, E, { topology: topo });

  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.blocked, "impassable");
    assertEquals(res.to, { x: 1, y: 0, z: 0 });
  }
  assertEquals(writes.length, 0, "no DB write on impassable");
  assertEquals(hooks.events.filter((e) => e.name === "map:player:moved").length, 0);
  assert(hooks.events.some((e) => e.name === "map:player:blocked"));

  hooks.detach();
});

Deno.test("moveCoord: guard veto surfaces reason and fires blocked hook", OPTS, async () => {
  _clearMoveGuards();
  const { u, writes } = makeSpySDK();
  const hooks = recordHooks();
  const topo = fakeTopo(biome("grass", "easy"));

  const guard = () => ({ allow: false as const, reason: "encumbered" });
  registerMoveGuard(guard);

  const from: Coord = { x: 0, y: 0, z: 0 };
  const res = await moveCoord(u, "p1", from, N, { topology: topo });

  assertEquals(res.ok, false);
  if (!res.ok) assertEquals(res.blocked, "encumbered");
  assertEquals(writes.length, 0);
  const blocked = hooks.events.find((e) => e.name === "map:player:blocked");
  assert(blocked);
  // deno-lint-ignore no-explicit-any
  assertEquals((blocked!.payload as any).reason, "encumbered");

  unregisterMoveGuard(guard);
  hooks.detach();
});

Deno.test("moveCoord: success fires map:player:moved exactly once and writes coord", OPTS, async () => {
  _clearMoveGuards();
  const { u, writes } = makeSpySDK();
  const hooks = recordHooks();
  const topo = fakeTopo(biome("grass", "easy"));

  const from: Coord = { x: 5, y: 5, z: 0 };
  const res = await moveCoord(u, "p1", from, E, { topology: topo });

  assertEquals(res.ok, true);
  if (res.ok) {
    assertEquals(res.to, { x: 6, y: 5, z: 0 });
    assertEquals(res.cost, 1);
    assertEquals(res.biome.id, "grass");
  }
  assertEquals(writes.length, 1, "exactly one DB write");
  assertEquals(writes[0].coord, { x: 6, y: 5, z: 0 });
  const moved = hooks.events.filter((e) => e.name === "map:player:moved");
  assertEquals(moved.length, 1, "moved fires exactly once");
  assertEquals(hooks.events.filter((e) => e.name === "map:player:blocked").length, 0);

  hooks.detach();
});

Deno.test("moveCoord: cost reflects traversal class", OPTS, async () => {
  _clearMoveGuards();
  const { u } = makeSpySDK();
  const hooks = recordHooks();

  const rough = await moveCoord(
    u, "p1", { x: 0, y: 0, z: 0 }, E,
    { topology: fakeTopo(biome("hills", "rough")), dryRun: true },
  );
  const hazard = await moveCoord(
    u, "p1", { x: 0, y: 0, z: 0 }, E,
    { topology: fakeTopo(biome("swamp", "hazard")), dryRun: true },
  );
  assert(rough.ok && rough.cost === 2);
  assert(hazard.ok && hazard.cost === 3);

  hooks.detach();
});

Deno.test("runMoveGuards: passes through when no guards veto", OPTS, async () => {
  _clearMoveGuards();
  const result = await runMoveGuards({
    u: {} as unknown as IUrsamuSDK,
    playerId: "p1",
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: 0, z: 0 },
    biome: biome("grass", "easy"),
    cost: 1,
  });
  assertEquals(result.allow, true);
});

Deno.test("runMoveGuards: first veto wins and emits map:player:blocked", OPTS, async () => {
  _clearMoveGuards();
  const hooks = recordHooks();
  registerMoveGuard(() => ({ allow: false, reason: "locked-door" }));
  registerMoveGuard(() => ({ allow: false, reason: "would-not-fire" }));
  const result = await runMoveGuards({
    u: {} as unknown as IUrsamuSDK,
    playerId: "p1",
    from: { x: 0, y: 0, z: 0 },
    to: { x: 1, y: 0, z: 0 },
    biome: biome("grass", "easy"),
    cost: 1,
  });
  assertEquals(result.allow, false);
  if (!result.allow) assertEquals(result.reason, "locked-door");
  const blocked = hooks.events.find((e) => e.name === "map:player:blocked");
  assert(blocked, "blocked event fires");
  // deno-lint-ignore no-explicit-any
  assertEquals((blocked!.payload as any).reason, "locked-door");
  hooks.detach();
  _clearMoveGuards();
});

import { entityStep, STEP_DIRECTIONS } from "../move.ts";
import { destroyEntity, setEntity, getEntity } from "../entities.ts";
import type { MapEntity } from "../schemas.ts";

Deno.test("entityStep: success moves entity and emits map:player:moved", OPTS, async () => {
  _clearMoveGuards();
  const hooks = recordHooks();
  const id = "e-step-1";
  const e: MapEntity = {
    id, coord: { x: 0, y: 0, z: 0 }, glyph: "@", kind: "scout",
    name: "Scout", vision: 4,
  };
  await setEntity(e);
  const u = {} as unknown as IUrsamuSDK;

  const res = await entityStep(u, e, STEP_DIRECTIONS.e, {
    topology: fakeTopo(biome("grass", "easy")),
    bounds: null,
  });
  assert(res.ok);
  if (res.ok) {
    assertEquals(res.to, { x: 1, y: 0, z: 0 });
    assertEquals(res.entity.coord, { x: 1, y: 0, z: 0 });
  }
  const stored = await getEntity(id);
  assertEquals(stored?.coord, { x: 1, y: 0, z: 0 });
  assertEquals(hooks.events.filter((h) => h.name === "map:player:moved").length, 1);

  await destroyEntity(id);
  hooks.detach();
});

Deno.test("entityStep: guard veto blocks move and surfaces reason", OPTS, async () => {
  _clearMoveGuards();
  const hooks = recordHooks();
  const id = "e-step-2";
  const e: MapEntity = {
    id, coord: { x: 5, y: 5, z: 0 }, glyph: "@", kind: "scout",
    name: "Scout", vision: 4,
  };
  await setEntity(e);
  registerMoveGuard(() => ({ allow: false, reason: "no-fuel" }));
  const u = {} as unknown as IUrsamuSDK;

  const res = await entityStep(u, e, STEP_DIRECTIONS.n, {
    topology: fakeTopo(biome("grass", "easy")),
    bounds: null,
  });
  assertEquals(res.ok, false);
  if (!res.ok) {
    assertEquals(res.blocked, "guard");
    assertEquals(res.reason, "no-fuel");
  }
  const stored = await getEntity(id);
  assertEquals(stored?.coord, { x: 5, y: 5, z: 0 });

  await destroyEntity(id);
  _clearMoveGuards();
  hooks.detach();
});
