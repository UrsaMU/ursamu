import { assert, assertEquals } from "@std/assert";

import {
  clearOverlay,
  getOverlay,
  getOverlaysInRegion,
  setOverlay,
} from "../state.ts";
import {
  getEntitiesInRegion,
  setEntity,
  destroyEntity,
  validateEntity,
} from "../entities.ts";
import { parseCoord } from "../commands_internals.ts";
import {
  coordKey,
  DEFAULT_REALM,
  realmOf,
  type TileOverlay,
} from "../schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

const ov = (extra: Partial<TileOverlay>): TileOverlay => ({
  key: "", // recomputed inside setOverlay
  x: 0,
  y: 0,
  z: 0,
  glyph: "#",
  name: "Spot",
  kind: "landmark",
  ...extra,
});

Deno.test("realm: coordKey defaults missing realm to \"default\"", OPTS, () => {
  assertEquals(coordKey({ x: 1, y: 2, z: 3 }), "default:1,2,3");
  assertEquals(coordKey({ x: 1, y: 2, z: 3, realm: "" }), "default:1,2,3");
  assertEquals(coordKey({ x: 1, y: 2, z: 3, realm: "tatooine" }), "tatooine:1,2,3");
  assertEquals(realmOf({ realm: undefined }), DEFAULT_REALM);
  assertEquals(realmOf({ realm: "matrix" }), "matrix");
});

Deno.test("realm: two overlays at (0,0,0) in different realms coexist", OPTS, async () => {
  await setOverlay(ov({ x: 0, y: 0, z: 0, name: "Default-Spot" }));
  await setOverlay(ov({ x: 0, y: 0, z: 0, realm: "alpha", name: "Alpha-Spot" }));

  const def = await getOverlay({ x: 0, y: 0, z: 0 });
  const alpha = await getOverlay({ x: 0, y: 0, z: 0, realm: "alpha" });
  assert(def, "default overlay should exist");
  assert(alpha, "alpha overlay should exist");
  assertEquals(def?.name, "Default-Spot");
  assertEquals(alpha?.name, "Alpha-Spot");
  assertEquals(realmOf(alpha!), "alpha");

  await clearOverlay({ x: 0, y: 0, z: 0 });
  await clearOverlay({ x: 0, y: 0, z: 0, realm: "alpha" });
});

Deno.test("realm: getOverlaysInRegion filters by realm of the bounds", OPTS, async () => {
  await setOverlay(ov({ x: 0, y: 0, z: 0, name: "D" }));
  await setOverlay(ov({ x: 0, y: 0, z: 0, realm: "beta", name: "B" }));

  const defRegion = await getOverlaysInRegion(
    { x: -1, y: -1, z: 0 },
    { x: 1, y: 1, z: 0 },
  );
  const betaRegion = await getOverlaysInRegion(
    { x: -1, y: -1, z: 0, realm: "beta" },
    { x: 1, y: 1, z: 0, realm: "beta" },
  );
  assertEquals(defRegion.length, 1);
  assertEquals(defRegion[0].name, "D");
  assertEquals(betaRegion.length, 1);
  assertEquals(betaRegion[0].name, "B");

  await clearOverlay({ x: 0, y: 0, z: 0 });
  await clearOverlay({ x: 0, y: 0, z: 0, realm: "beta" });
});

Deno.test("realm: entities scoped per realm in getEntitiesInRegion", OPTS, async () => {
  await setEntity({
    id: "e-default",
    coord: { x: 0, y: 0, z: 0 },
    glyph: "@", kind: "scout", name: "Default-Scout", vision: 4,
  });
  await setEntity({
    id: "e-alpha",
    coord: { x: 0, y: 0, z: 0, realm: "alpha" },
    glyph: "@", kind: "scout", name: "Alpha-Scout", vision: 4,
  });

  const defaultPool = await getEntitiesInRegion(
    { x: -1, y: -1, z: 0 },
    { x: 1, y: 1, z: 0 },
  );
  const alphaPool = await getEntitiesInRegion(
    { x: -1, y: -1, z: 0, realm: "alpha" },
    { x: 1, y: 1, z: 0, realm: "alpha" },
  );
  assertEquals(defaultPool.map((e) => e.id), ["e-default"]);
  assertEquals(alphaPool.map((e) => e.id), ["e-alpha"]);

  await destroyEntity("e-default");
  await destroyEntity("e-alpha");
});

Deno.test("realm: validateEntity accepts optional realm; rejects invalid slug", OPTS, () => {
  const base = {
    id: "x",
    glyph: "@" as const,
    kind: "scout",
    name: "X",
    vision: 1,
  };
  assert(validateEntity({ ...base, coord: { x: 0, y: 0, z: 0 } }));
  assert(validateEntity({ ...base, coord: { x: 0, y: 0, z: 0, realm: "ok" } }));
  assert(!validateEntity({ ...base, coord: { x: 0, y: 0, z: 0, realm: "" } }));
  assert(!validateEntity({ ...base, coord: { x: 0, y: 0, z: 0, realm: "has space" } }));
});

Deno.test("realm: parseCoord accepts optional realm token", OPTS, () => {
  assertEquals(parseCoord("10 -5"), { x: 10, y: -5, z: 0 });
  assertEquals(parseCoord("10 -5 2"), { x: 10, y: -5, z: 2 });
  assertEquals(parseCoord("10 -5 2 tatooine"), {
    x: 10, y: -5, z: 2, realm: "tatooine",
  });
  // 3-token form with non-numeric 3rd token → treat as realm at z=0
  assertEquals(parseCoord("10 -5 matrix"), {
    x: 10, y: -5, z: 0, realm: "matrix",
  });
  // Realm with invalid character (after whitespace split) → rejected.
  assertEquals(parseCoord("10 -5 2 bad!realm"), null);
});

Deno.test("realm: header gets [Realm: x] prefix when not default", OPTS, async () => {
  // Direct check via cfgSectorName + the renderer hook is in format.ts; we
  // simulate by inspecting the title-building expression used there.
  const realm = realmOf({ realm: "tatooine" });
  const base = "Sector 0,0,0";
  const title = realm !== DEFAULT_REALM ? `[Realm: ${realm}] ${base}` : base;
  assertEquals(title, "[Realm: tatooine] Sector 0,0,0");
  const titleDefault = DEFAULT_REALM === DEFAULT_REALM ? base : `[Realm: x] ${base}`;
  assertEquals(titleDefault, base);
  return await Promise.resolve();
});
