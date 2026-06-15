import { assertEquals, assertExists } from "@std/assert";

import { renderMap } from "../renderer.ts";
import { getPlayerCoord, validateOverlay } from "../state.ts";
import { parseCoord } from "../commands_internals.ts";
import { validateEntity } from "../entities.ts";
import { MAX_VISION } from "../schemas.ts";
import type {
  Coord,
  MapEntity,
  NeighborhoodSample,
  RenderInput,
  TopologySample,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const biome = (id = "mud") => ({
  id,
  name: "Mudflats",
  glyph: ".",
  phrases: { self: ["mud spreads everywhere"], adjacent: ["mud spreads"] },
});

const sample = (coord: Coord, id = "mud"): TopologySample => ({
  coord,
  elevation: 0.5,
  moisture: 0.5,
  biome: biome(id),
});

const ring = (centre: Coord): NeighborhoodSample => ({
  centre: sample(centre),
  ring: {
    N: sample({ ...centre, y: centre.y + 1 }),
    NE: sample({ x: centre.x + 1, y: centre.y + 1, z: centre.z }),
    E: sample({ ...centre, x: centre.x + 1 }),
    SE: sample({ x: centre.x + 1, y: centre.y - 1, z: centre.z }),
    S: sample({ ...centre, y: centre.y - 1 }),
    SW: sample({ x: centre.x - 1, y: centre.y - 1, z: centre.z }),
    W: sample({ ...centre, x: centre.x - 1 }),
    NW: sample({ x: centre.x - 1, y: centre.y + 1, z: centre.z }),
  },
});

Deno.test("H1: overlay name with [...] is escaped, not passed raw", OPTS, () => {
  const centre: Coord = { x: 0, y: 0, z: 0 };
  const input: RenderInput = {
    sectorTitle: "Test",
    centre,
    tiles: [[{ coord: centre, glyph: ".", authored: false }]],
    neighborhood: ring(centre),
    overlays: [{
      key: "0,0,0",
      x: 0, y: 0, z: 0,
      kind: "infrastructure",
      name: "[shutdown()]",
      faction: "[hack()]",
      glyph: "#",
    }],
    entities: [],
    adjacency: { N: "Plains", S: "Plains", E: "Plains", W: "Plains" },
  };
  const out = renderMap(input);
  assertEquals(out.match(/\[shutdown\(\)\]/), null, "overlay.name must be escaped");
  assertEquals(out.match(/\[hack\(\)\]/), null, "overlay.faction must be escaped");
});

Deno.test("H1: renderer section labels do not emit raw [ X ]", OPTS, () => {
  const centre: Coord = { x: 0, y: 0, z: 0 };
  const input: RenderInput = {
    sectorTitle: "Sec",
    centre,
    tiles: [[{ coord: centre, glyph: ".", authored: false }]],
    neighborhood: ring(centre),
    overlays: [],
    entities: [],
    adjacency: { N: "P", S: "P", E: "P", W: "P" },
  };
  const out = renderMap(input);
  assertEquals(out.match(/\[ [A-Z]/), null, "labels must not use [ X ] syntax");
});

Deno.test("L1: getPlayerCoord reads state.coord directly", OPTS, () => {
  const result = getPlayerCoord({ coord: { x: 5, y: 7, z: 0 } });
  assertExists(result);
  assertEquals(result, { x: 5, y: 7, z: 0 });
});

Deno.test("L1: getPlayerCoord returns null for missing/invalid coord", OPTS, () => {
  assertEquals(getPlayerCoord({}), null);
  assertEquals(getPlayerCoord({ coord: null }), null);
  assertEquals(getPlayerCoord({ coord: { x: 1, y: 2 } }), null);
  assertEquals(getPlayerCoord({ coord: { x: 1, y: 2, z: NaN } }), null);
  assertEquals(getPlayerCoord({ coord: { x: "1", y: 2, z: 0 } }), null);
});

Deno.test("M2: parseCoord rejects non-integers and out-of-range", OPTS, () => {
  assertEquals(parseCoord("1.5 2 3"), null);
  assertEquals(parseCoord("1e20 0 0"), null);
  assertEquals(parseCoord("-1e20 0 0"), null);
  assertEquals(parseCoord("foo bar"), null);
  assertEquals(parseCoord("10 20"), { x: 10, y: 20, z: 0 });
  assertEquals(parseCoord("10 20 -3"), { x: 10, y: 20, z: -3 });
});

Deno.test("L3: validateOverlay rejects bad payloads", OPTS, () => {
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 1e20, y: 0, z: 0 }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, name: "[bad()]" }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, glyph: "ab" }),
    false,
  );
  assertEquals(
    validateOverlay({ key: "0,0,0", x: 0, y: 0, z: 0, name: "Bunker" }),
    true,
  );
});

const validEntity = (over: Partial<MapEntity> = {}): MapEntity => ({
  id: "ent-1",
  coord: { x: 0, y: 0, z: 0 },
  glyph: "R",
  kind: "vehicle",
  name: "Recon Walker",
  vision: 3,
  ...over,
});

Deno.test("H2: validateEntity rejects [ or ] in name", OPTS, () => {
  assertEquals(validateEntity(validEntity({ name: "[bad()]" })), false);
});

Deno.test("H2: validateEntity rejects [ or ] in status", OPTS, () => {
  assertEquals(validateEntity(validEntity({ status: "[bad()]" })), false);
});

Deno.test("H2: validateEntity rejects [ or ] in kind", OPTS, () => {
  assertEquals(validateEntity(validEntity({ kind: "[bad()]" })), false);
});

Deno.test("H2: validateEntity rejects [ or ] in factionId", OPTS, () => {
  assertEquals(validateEntity(validEntity({ factionId: "[bad()]" })), false);
});

Deno.test("H2: validateEntity caps vision at MAX_VISION", OPTS, () => {
  assertEquals(validateEntity(validEntity({ vision: MAX_VISION + 1 })), false);
});

Deno.test("H2: validateEntity rejects multi-char glyph", OPTS, () => {
  assertEquals(validateEntity(validEntity({ glyph: "ab" })), false);
});

// ─── H1: pilot authorization on launch / move / land ─────────────────────────

import {
  canPilot,
  canClaimEntity,
  canViewSubject,
  isInBounds,
  validateCoord,
} from "../commands_internals.ts";

const mockActor = (id: string, flags: string[] = []) => ({
  id,
  flags: { has: (f: string) => flags.includes(f) },
});

Deno.test("H1: passenger cannot pilot vehicle they don't own", OPTS, () => {
  const passenger = mockActor("#100");
  const vehicle = { id: "#42", owner: "#7" };
  assertEquals(canPilot(passenger, vehicle), false);
});

Deno.test("H1: owner can pilot their own vehicle", OPTS, () => {
  const owner = mockActor("#7");
  const vehicle = { id: "#42", owner: "#7" };
  assertEquals(canPilot(owner, vehicle), true);
});

Deno.test("H1: admin can pilot any vehicle", OPTS, () => {
  const admin = mockActor("#1", ["admin"]);
  const vehicle = { id: "#42", owner: "#7" };
  assertEquals(canPilot(admin, vehicle), true);
});

Deno.test("H1: ownerless vehicle is not pilotable by non-admin", OPTS, () => {
  const player = mockActor("#100");
  const vehicle = { id: "#42" };
  assertEquals(canPilot(player, vehicle), false);
});

// ─── H2: entity claim authorization ──────────────────────────────────────────

Deno.test("H2: builder cannot claim an unowned entity", OPTS, () => {
  const builder = mockActor("#100", ["builder"]);
  const entity = { controllerId: undefined };
  assertEquals(canClaimEntity(builder, entity), false);
});

Deno.test("H2: admin can claim any entity", OPTS, () => {
  const admin = mockActor("#1", ["wizard"]);
  const entity = { controllerId: undefined };
  assertEquals(canClaimEntity(admin, entity), true);
});

Deno.test("H2: existing controller can re-claim their own entity", OPTS, () => {
  const owner = mockActor("#100");
  const entity = { controllerId: "#100" };
  assertEquals(canClaimEntity(owner, entity), true);
});

Deno.test("H2: non-admin builder cannot steal entity from another controller", OPTS, () => {
  const thief = mockActor("#101", ["builder"]);
  const entity = { controllerId: "#100" };
  assertEquals(canClaimEntity(thief, entity), false);
});

// ─── M2: bounds enforcement on movement + launch ──────────────────────────────

Deno.test("M2: isInBounds returns true when no bounds", OPTS, () => {
  assertEquals(isInBounds({ x: 1e6, y: 1e6, z: 0 }), true);
});

Deno.test("M2: isInBounds rejects out-of-bounds coord", OPTS, () => {
  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 100, y: 100, z: 0 } };
  assertEquals(isInBounds({ x: 101, y: 50, z: 0 }, bounds), false);
  assertEquals(isInBounds({ x: -1, y: 50, z: 0 }, bounds), false);
  assertEquals(isInBounds({ x: 50, y: 50, z: 0 }, bounds), true);
});

// ─── M3: launch coord validation ──────────────────────────────────────────────

Deno.test("M3: validateCoord rejects non-integer + out-of-range + bounds", OPTS, () => {
  assertEquals(validateCoord({ x: 1.5, y: 0, z: 0 }), null);
  assertEquals(validateCoord({ x: 1e20, y: 0, z: 0 }), null);
  assertEquals(validateCoord({ x: "10", y: 0, z: 0 }), null);
  assertEquals(validateCoord(null), null);
  assertEquals(validateCoord({ x: 5, y: 5, z: 0 }), { x: 5, y: 5, z: 0 });

  const bounds = { min: { x: 0, y: 0, z: 0 }, max: { x: 10, y: 10, z: 0 } };
  assertEquals(validateCoord({ x: 11, y: 0, z: 0 }, bounds), null);
  assertEquals(validateCoord({ x: 5, y: 5, z: 0 }, bounds), { x: 5, y: 5, z: 0 });
});

// ─── H3: subject visibility authorization (DESCFORMAT) ───────────────────────

Deno.test("H3: link-mode viewer cannot look at out-of-faction subject", OPTS, () => {
  const active = {
    entity: { id: "scout-1", factionId: "A" },
    mode: "link" as const,
  };
  const subject = { id: "tank-imp", factionId: "B" };
  assertEquals(canViewSubject(active, subject), false);
});

Deno.test("H3: container-mode viewer can look at their own subject (self)", OPTS, () => {
  const active = {
    entity: { id: "ent-1", factionId: "A" },
    mode: "container" as const,
  };
  const subject = { id: "ent-1", factionId: "A" };
  assertEquals(canViewSubject(active, subject), true);
});

Deno.test("H3: container-mode viewer cannot look at a different subject", OPTS, () => {
  const active = {
    entity: { id: "ent-1", factionId: "A" },
    mode: "container" as const,
  };
  const subject = { id: "ent-2", factionId: "B" };
  assertEquals(canViewSubject(active, subject), false);
});

Deno.test("H3: faction-mate viewer can look at faction-mate subject", OPTS, () => {
  const active = {
    entity: { id: "scout-1", factionId: "Republic" },
    mode: "link" as const,
  };
  const subject = { id: "scout-2", factionId: "Republic" };
  assertEquals(canViewSubject(active, subject), true);
});

Deno.test("H3: admin spectate always passes", OPTS, () => {
  const active = {
    entity: { id: "admin-cam", factionId: undefined },
    mode: "spectate" as const,
  };
  const subject = { id: "anything", factionId: "Imperial" };
  assertEquals(canViewSubject(active, subject), true);
});

Deno.test("H3: factionless viewer and factionless subject (distinct ids) → false", OPTS, () => {
  const active = {
    entity: { id: "ent-1", factionId: undefined },
    mode: "link" as const,
  };
  const subject = { id: "ent-2", factionId: undefined };
  assertEquals(canViewSubject(active, subject), false);
});
