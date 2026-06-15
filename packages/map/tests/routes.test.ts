import { assert, assertEquals } from "@std/assert";

import {
  buildRenderResponse,
  handleOverlayRoute,
  handlePlayerRoute,
  handleRenderRoute,
} from "../routes.ts";
import { clearOverlay, setOverlay } from "../state.ts";
import { defaultMapConfig } from "../config.default.ts";
import { createTopologyEngine } from "../topology.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function req(url: string, init: RequestInit = {}): Request {
  return new Request(url, init);
}

Deno.test("routes: render returns 401 before any work when userId is null", OPTS, async () => {
  const res = await handleRenderRoute(
    req("https://x/api/v1/map/realm/default/render?center=0,0&radius=2"),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("routes: player returns 401 when userId null", OPTS, async () => {
  const res = await handlePlayerRoute(req("https://x/api/v1/map/player/p1"), null);
  assertEquals(res.status, 401);
});

Deno.test("routes: overlay POST returns 401 when userId null", OPTS, async () => {
  const res = await handleOverlayRoute(
    req("https://x/api/v1/map/overlay", {
      method: "POST",
      body: JSON.stringify({ x: 0, y: 0, z: 0 }),
    }),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("routes: overlay DELETE returns 401 when userId null", OPTS, async () => {
  const res = await handleOverlayRoute(
    req("https://x/api/v1/map/overlay?x=0&y=0&z=0", { method: "DELETE" }),
    null,
  );
  assertEquals(res.status, 401);
});

Deno.test("routes: render happy-path returns 401 with valid query (parity with renderer)", OPTS, async () => {
  // Use raw helper to confirm tile grid matches direct topology + overlay merge.
  const realm = "default";
  const centre = { x: 0, y: 0, z: 0 };
  const radius = 1;

  await setOverlay({
    key: "", x: 0, y: 0, z: 0, glyph: "#", name: "Spot", kind: "landmark",
  });

  const dto = await buildRenderResponse(realm, centre, radius);
  assertEquals(dto.realm, "default");
  assertEquals(dto.radius, 1);
  // 3x3 grid
  assertEquals(dto.tiles.length, 9);

  // Parity check: glyphs match what a direct sample would return.
  const topo = createTopologyEngine(defaultMapConfig);
  for (const t of dto.tiles) {
    if (t.x === 0 && t.y === 0) {
      // overlay wins
      assertEquals(t.glyph, "#");
      assertEquals(t.authored, true);
    } else {
      const expected = topo.sample({ x: t.x, y: t.y, z: t.z }).biome.glyph;
      assertEquals(t.glyph, expected);
      assertEquals(t.authored, false);
    }
  }

  await clearOverlay({ x: 0, y: 0, z: 0 });
});

Deno.test("routes: render rejects invalid radius", OPTS, async () => {
  // Bypass auth by using a dummy userId; parsing happens after auth.
  const res = await handleRenderRoute(
    req("https://x/api/v1/map/realm/default/render?center=0,0&radius=99999"),
    "u1",
  );
  assertEquals(res.status, 400);
});

Deno.test("routes: render rejects missing query params", OPTS, async () => {
  const res = await handleRenderRoute(
    req("https://x/api/v1/map/realm/default/render"),
    "u1",
  );
  assertEquals(res.status, 400);
});

Deno.test("routes: overlay POST without admin → 403 (uses unknown actor)", OPTS, async () => {
  // "nobody-such-actor" won't resolve in dbojs → isAdmin returns false.
  const res = await handleOverlayRoute(
    req("https://x/api/v1/map/overlay", {
      method: "POST",
      body: JSON.stringify({ x: 0, y: 0, z: 0 }),
    }),
    "nobody-such-actor",
  );
  assertEquals(res.status, 403);
});

Deno.test("routes: render route — wrong path under prefix returns 404", OPTS, async () => {
  const res = await handleRenderRoute(
    req("https://x/api/v1/map/realm/default/notrender"),
    "u1",
  );
  assertEquals(res.status, 404);
});

Deno.test("routes: render method-not-allowed for non-GET", OPTS, async () => {
  const res = await handleRenderRoute(
    req("https://x/api/v1/map/realm/default/render?center=0,0&radius=1", {
      method: "POST",
    }),
    "u1",
  );
  assertEquals(res.status, 405);
});

Deno.test("routes: buildRenderResponse parity — overlay overrides tile glyph", OPTS, async () => {
  await setOverlay({
    key: "", x: 3, y: 3, z: 0, glyph: "@", name: "Cache", kind: "cache",
  });
  const dto = await buildRenderResponse("default", { x: 3, y: 3, z: 0 }, 0);
  assert(dto.tiles.length === 1);
  assertEquals(dto.tiles[0].glyph, "@");
  assertEquals(dto.tiles[0].authored, true);
  await clearOverlay({ x: 3, y: 3, z: 0 });
});
