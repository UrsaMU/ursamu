// moveCoord — single-step movement with traversal cost + guard registry.
// Distinct from setPlayerCoord (which remains a teleport API used by builders /
// chargen). Siblings register guards to veto with reasons (encumbrance, locked
// doors, faction permissions, matrix ICE).

import { gameHooks } from "ursamu";
import type { IUrsamuSDK } from "ursamu";

import type { BiomeDefinition, Coord, MapBounds, MapEntity } from "./schemas.ts";
import { defaultMapConfig } from "./config.default.ts";
import { createTopologyEngine, type TopologyEngine } from "./topology.ts";
import { getOverlay, setPlayerCoord } from "./state.ts";
import { canStackWith, isInBounds } from "./commands_internals.ts";
import { getEntitiesInRegion, moveEntity } from "./entities.ts";

// ─── Direction constants ─────────────────────────────────────────────────────
//
// Matches topology.ts RING_OFFSETS convention: north = dy:-1 (rows grow
// southward in render space). Re-export so siblings can build movement UIs
// without redefining the math.

export interface DirectionDelta {
  dx: number;
  dy: number;
}

export const N: DirectionDelta = { dx: 0, dy: -1 };
export const NE: DirectionDelta = { dx: 1, dy: -1 };
export const E: DirectionDelta = { dx: 1, dy: 0 };
export const SE: DirectionDelta = { dx: 1, dy: 1 };
export const S: DirectionDelta = { dx: 0, dy: 1 };
export const SW: DirectionDelta = { dx: -1, dy: 1 };
export const W: DirectionDelta = { dx: -1, dy: 0 };
export const NW: DirectionDelta = { dx: -1, dy: -1 };

// ─── Cost table ──────────────────────────────────────────────────────────────

const TRAVERSAL_COST: Record<NonNullable<BiomeDefinition["traversal"]>, number> = {
  trivial: 1,
  easy: 1,
  rough: 2,
  hazard: 3,
  impassable: Number.POSITIVE_INFINITY,
};

// ─── Guard registry ──────────────────────────────────────────────────────────

export interface MoveContext {
  /** SDK handle for the move. */
  u: IUrsamuSDK;
  /** Player whose active entity is being moved. */
  playerId: string;
  /** Origin coord (snapshot at call). */
  from: Coord;
  /** Destination coord after delta is applied. */
  to: Coord;
  /** Biome resolved at the destination. */
  biome: BiomeDefinition;
  /** Computed traversal cost (∞ for impassable). */
  cost: number;
}

export type GuardResult = { allow: true } | { allow: false; reason: string };

export type MoveGuard = (
  ctx: MoveContext,
) => GuardResult | Promise<GuardResult>;

const guards: MoveGuard[] = [];

export function registerMoveGuard(fn: MoveGuard): void {
  if (!guards.includes(fn)) guards.push(fn);
}

export function unregisterMoveGuard(fn: MoveGuard): void {
  const i = guards.indexOf(fn);
  if (i >= 0) guards.splice(i, 1);
}

/** Test-only: drop all registered guards. */
export function _clearMoveGuards(): void {
  guards.length = 0;
}

/**
 * Run the registered guard chain against a caller-built {@link MoveContext}.
 * Use this when you have your own move pipeline (e.g. entity-driven moves
 * via `moveEntity`) and just want guard veto semantics. First veto wins;
 * throwing guards are isolated and skipped. On veto, emits `map:player:blocked`
 * with the reason so listeners observe the same event surface as `moveCoord`.
 */
export async function runMoveGuards(ctx: MoveContext): Promise<GuardResult> {
  for (const g of guards) {
    let r: GuardResult;
    try {
      r = await g(ctx);
    } catch (err) {
      console.error("[map-plugin] move guard threw:", err);
      continue;
    }
    if (!r.allow) {
      emit("map:player:blocked", {
        playerId: ctx.playerId,
        from: ctx.from,
        to: ctx.to,
        reason: r.reason,
        biome: ctx.biome,
      });
      return r;
    }
  }
  return { allow: true };
}

// ─── moveCoord ───────────────────────────────────────────────────────────────

export interface MoveOptions {
  /** Inject a topology engine (defaults to `defaultMapConfig`). */
  topology?: TopologyEngine;
  /** Skip the DB write — useful for dry-run cost queries. */
  dryRun?: boolean;
}

export type MoveSuccess = {
  ok: true;
  cost: number;
  biome: BiomeDefinition;
  from: Coord;
  to: Coord;
};

export type MoveFailure = {
  ok: false;
  blocked: string;
  cost: number;
  biome: BiomeDefinition;
  from: Coord;
  to: Coord;
};

export type MoveResult = MoveSuccess | MoveFailure;

function applyDelta(from: Coord, d: DirectionDelta | Coord): Coord {
  if ("x" in d) return { ...d };
  return { x: from.x + d.dx, y: from.y + d.dy, z: from.z };
}

export async function moveCoord(
  u: IUrsamuSDK,
  playerId: string,
  from: Coord,
  deltaOrCoord: DirectionDelta | Coord,
  opts: MoveOptions = {},
): Promise<MoveResult> {
  const to = applyDelta(from, deltaOrCoord);
  const topo = opts.topology ?? createTopologyEngine(defaultMapConfig);

  // Resolve biome: overlay biome id wins if set; otherwise sample topology.
  const overlay = await getOverlay(to);
  let biome: BiomeDefinition;
  if (overlay?.biome) {
    const found = defaultMapConfig.biomes.find((b) => b.id === overlay.biome);
    biome = found ?? topo.sample(to).biome;
  } else {
    biome = topo.sample(to).biome;
  }
  const traversal = biome.traversal;
  const baseCost = traversal ? TRAVERSAL_COST[traversal] : 1;

  // Impassable terrain — short-circuit BEFORE any DB write or guard run.
  if (!Number.isFinite(baseCost)) {
    const result: MoveFailure = {
      ok: false, blocked: "impassable", cost: baseCost, biome, from, to,
    };
    emit("map:player:blocked", { playerId, from, to, reason: "impassable", biome });
    return result;
  }

  // Overlay-level hard block (walls, doors).
  if (overlay?.blocksMovement === true) {
    const result: MoveFailure = {
      ok: false, blocked: "overlay", cost: baseCost, biome, from, to,
    };
    emit("map:player:blocked", { playerId, from, to, reason: "overlay", biome });
    return result;
  }

  // Run guards in registration order; first veto wins.
  const ctx: MoveContext = { u, playerId, from, to, biome, cost: baseCost };
  for (const g of guards) {
    let r: GuardResult;
    try {
      r = await g(ctx);
    } catch (err) {
      console.error("[map-plugin] move guard threw:", err);
      continue;
    }
    if (!r.allow) {
      emit("map:player:blocked", { playerId, from, to, reason: r.reason, biome });
      return { ok: false, blocked: r.reason, cost: baseCost, biome, from, to };
    }
  }

  if (!opts.dryRun) {
    await setPlayerCoord(u, playerId, to);
  }
  emit("map:player:moved", { playerId, from, to, biome, cost: baseCost });
  return { ok: true, cost: baseCost, biome, from, to };
}

// ─── Hook emission ───────────────────────────────────────────────────────────
//
// `gameHooks.emit` is typed against the engine's `GameHookMap`. Map events
// aren't declared there yet, so we cast at the boundary; payloads stay strongly
// typed inside this module.

interface MoveHookPayloads {
  "map:player:moved": {
    playerId: string;
    from: Coord;
    to: Coord;
    biome: BiomeDefinition;
    cost: number;
  };
  "map:player:blocked": {
    playerId: string;
    from: Coord;
    to: Coord;
    reason: string;
    biome: BiomeDefinition;
  };
}

function emit<K extends keyof MoveHookPayloads>(
  name: K,
  payload: MoveHookPayloads[K],
): void {
  try {
    // deno-lint-ignore no-explicit-any
    (gameHooks as any).emit(name, payload);
  } catch (err) {
    console.error(`[map-plugin] gameHooks.emit ${name} failed:`, err);
  }
}

// ─── entityStep: full entity-driven movement primitive ─────────────────────
//
// `moveCoord` operates on player coords; this is the entity analog and the
// engine behind `+move`. Sibling plugins can build their own movement command
// names ("go", "drive", "pilot", "rush") by calling entityStep with the
// active entity + a direction or destination.

/**
 * User-facing direction parse map for compass / cardinal commands.
 * Convention: north = +y (matches screen-up in the renderer).
 *
 * NOTE: the bare-letter exports `N`, `S`, `E`, ... in this module follow the
 * **topology** convention (north = -y) for parity with `topology.ts`'s
 * RING_OFFSETS. Use STEP_DIRECTIONS for user-facing direction parsing.
 */
export const STEP_DIRECTIONS: Record<string, DirectionDelta> = {
  n: { dx: 0, dy: 1 }, north: { dx: 0, dy: 1 },
  s: { dx: 0, dy: -1 }, south: { dx: 0, dy: -1 },
  e: { dx: 1, dy: 0 }, east: { dx: 1, dy: 0 },
  w: { dx: -1, dy: 0 }, west: { dx: -1, dy: 0 },
  ne: { dx: 1, dy: 1 }, northeast: { dx: 1, dy: 1 },
  nw: { dx: -1, dy: 1 }, northwest: { dx: -1, dy: 1 },
  se: { dx: 1, dy: -1 }, southeast: { dx: 1, dy: -1 },
  sw: { dx: -1, dy: -1 }, southwest: { dx: -1, dy: -1 },
};

export interface EntityStepOptions {
  /** Bounds to enforce. Defaults to `defaultMapConfig.bounds` if unset. */
  bounds?: MapBounds | null;
  /** Inject a TopologyEngine (defaults to defaultMapConfig's). */
  topology?: TopologyEngine;
  /** When true, run guards + cost resolution but skip the DB write. */
  dryRun?: boolean;
}

export type EntityStepResult =
  | { ok: true; entity: MapEntity; from: Coord; to: Coord; cost: number; biome: BiomeDefinition }
  | { ok: false; blocked: string; reason?: string; from: Coord; to: Coord; biome: BiomeDefinition; cost: number };

/**
 * Single-step entity movement with full validation pipeline:
 *   1. resolve destination (delta or coord)
 *   2. config bounds
 *   3. overlay.blocksMovement
 *   4. occupant stacking (canStackWith)
 *   5. impassable biome
 *   6. registered move-guards (first veto wins)
 *   7. moveEntity + emit `map:player:moved`
 *
 * Returns a structured result so callers (custom commands) can render their
 * own user-facing messages and decide whether to charge action points.
 */
export async function entityStep(
  u: IUrsamuSDK,
  entity: MapEntity,
  deltaOrCoord: DirectionDelta | Coord,
  opts: EntityStepOptions = {},
): Promise<EntityStepResult> {
  const from = entity.coord;
  const to: Coord = "x" in deltaOrCoord
    ? { ...deltaOrCoord }
    : ((): Coord => {
      const next: Coord = { x: from.x + deltaOrCoord.dx, y: from.y + deltaOrCoord.dy, z: from.z };
      if (from.realm !== undefined) next.realm = from.realm;
      return next;
    })();

  const topo = opts.topology ?? createTopologyEngine(defaultMapConfig);
  const overlay = await getOverlay(to);
  let biome: BiomeDefinition;
  if (overlay?.biome) {
    biome = defaultMapConfig.biomes.find((b) => b.id === overlay.biome) ?? topo.sample(to).biome;
  } else {
    biome = topo.sample(to).biome;
  }
  const traversal = biome.traversal;
  const baseCost = traversal ? TRAVERSAL_COST[traversal] : 1;

  const bounds = opts.bounds === undefined ? defaultMapConfig.bounds : (opts.bounds ?? undefined);
  if (!isInBounds(to, bounds)) {
    emit("map:player:blocked", { playerId: entity.controllerId ?? entity.id, from, to, reason: "bounds", biome });
    return { ok: false, blocked: "bounds", from, to, biome, cost: baseCost };
  }
  if (!Number.isFinite(baseCost)) {
    emit("map:player:blocked", { playerId: entity.controllerId ?? entity.id, from, to, reason: "impassable", biome });
    return { ok: false, blocked: "impassable", from, to, biome, cost: baseCost };
  }
  if (overlay?.blocksMovement === true) {
    emit("map:player:blocked", { playerId: entity.controllerId ?? entity.id, from, to, reason: "overlay", biome });
    return { ok: false, blocked: "overlay", from, to, biome, cost: baseCost };
  }

  const occupants = await getEntitiesInRegion({ ...to }, { ...to });
  const stack = canStackWith(entity, occupants);
  if (!stack.ok) {
    emit("map:player:blocked", { playerId: entity.controllerId ?? entity.id, from, to, reason: stack.reason, biome });
    return { ok: false, blocked: "stack", reason: stack.reason, from, to, biome, cost: baseCost };
  }

  const guardResult = await runMoveGuards({
    u,
    playerId: entity.controllerId ?? entity.id,
    from,
    to,
    biome,
    cost: baseCost,
  });
  if (!guardResult.allow) {
    return { ok: false, blocked: "guard", reason: guardResult.reason, from, to, biome, cost: baseCost };
  }

  let moved: MapEntity = entity;
  if (!opts.dryRun) moved = await moveEntity(entity.id, to);
  emit("map:player:moved", {
    playerId: entity.controllerId ?? entity.id,
    from, to, biome, cost: baseCost,
  });
  return { ok: true, entity: moved, from, to, cost: baseCost, biome };
}
