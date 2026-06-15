// REST API for the map plugin.
//
//   GET    /api/v1/map/realm/:id/render?center=x,y&radius=N → tile grid
//   GET    /api/v1/map/player/:id                            → { realm, coord, biome }
//   POST   /api/v1/map/overlay                               → author overlay (admin)
//   DELETE /api/v1/map/overlay                               → clear overlay (admin)
//
// All routes require bearer auth — 401 before any DB or topology work when
// userId is null. Realm scoping is being added in a sibling PR; until it lands
// the `realm` param is accepted and echoed but storage stays single-realm.

import { dbojs, registerPluginRoute } from "ursamu";
import type { Coord, TileOverlay } from "./schemas.ts";
import { defaultMapConfig } from "./config.default.ts";
import { createTopologyEngine } from "./topology.ts";
import {
  clearOverlay,
  getOverlay,
  getOverlaysInRegion,
  setOverlay,
} from "./state.ts";

// ─── Auth helpers ────────────────────────────────────────────────────────────

async function isAdmin(userId: string): Promise<boolean> {
  const actor = await dbojs.queryOne({ id: userId });
  if (!actor) return false;
  const flags = new Set(
    String((actor as { flags?: unknown }).flags ?? "").split(" "),
  );
  return flags.has("admin") || flags.has("wizard") || flags.has("superuser");
}

const DEFAULT_REALM_FALLBACK = "default";
const MAX_RADIUS = 32;

// ─── Render route ────────────────────────────────────────────────────────────

interface RenderTileDTO {
  x: number;
  y: number;
  z: number;
  glyph: string;
  authored: boolean;
  biome?: string;
  overlayName?: string;
}

interface RenderResponse {
  realm: string;
  centre: { x: number; y: number; z: number };
  radius: number;
  tiles: RenderTileDTO[];
}

/**
 * Parametric helper so tests can call without booting the HTTP layer.
 * Exported for unit testing.
 */
export async function buildRenderResponse(
  realm: string,
  centre: Coord,
  radius: number,
): Promise<RenderResponse> {
  const topo = createTopologyEngine(defaultMapConfig);
  const min: Coord = { x: centre.x - radius, y: centre.y - radius, z: centre.z };
  const max: Coord = { x: centre.x + radius, y: centre.y + radius, z: centre.z };
  const regionOverlays = await getOverlaysInRegion(min, max);
  const lookup = new Map<string, TileOverlay>();
  for (const o of regionOverlays) lookup.set(`${o.x},${o.y},${o.z}`, o);

  const tiles: RenderTileDTO[] = [];
  for (let y = max.y; y >= min.y; y--) {
    for (let x = min.x; x <= max.x; x++) {
      const coord: Coord = { x, y, z: centre.z };
      const ov = lookup.get(`${x},${y},${centre.z}`);
      const sample = topo.sample(coord);
      const glyph = ov?.glyph ?? sample.biome.glyph;
      tiles.push({
        x, y, z: centre.z,
        glyph,
        authored: !!ov?.glyph,
        biome: ov?.biome ?? sample.biome.id,
        overlayName: ov?.name,
      });
    }
  }
  return { realm, centre: { ...centre }, radius, tiles };
}

function parseRenderQuery(url: URL): { centre: Coord; radius: number } | { error: string } {
  const center = url.searchParams.get("center");
  const radiusRaw = url.searchParams.get("radius");
  if (!center || !radiusRaw) return { error: "center and radius are required" };
  const parts = center.split(",");
  if (parts.length < 2 || parts.length > 3) return { error: "center must be x,y[,z]" };
  const x = Number(parts[0]);
  const y = Number(parts[1]);
  const z = parts[2] !== undefined ? Number(parts[2]) : 0;
  const radius = Number(radiusRaw);
  if (![x, y, z, radius].every(Number.isFinite)) return { error: "non-numeric coord" };
  if (!Number.isInteger(radius) || radius < 0 || radius > MAX_RADIUS) {
    return { error: `radius must be 0..${MAX_RADIUS}` };
  }
  return { centre: { x, y, z }, radius };
}

// ─── Overlay payload validation ──────────────────────────────────────────────

function parseOverlayBody(body: unknown): TileOverlay | { error: string } {
  if (!body || typeof body !== "object") return { error: "body must be an object" };
  const b = body as Record<string, unknown>;
  const x = b.x, y = b.y, z = b.z;
  if (!Number.isInteger(x) || !Number.isInteger(y) || !Number.isInteger(z)) {
    return { error: "x, y, z must be integers" };
  }
  const o: TileOverlay = {
    key: `${x as number},${y as number},${z as number}`,
    x: x as number, y: y as number, z: z as number,
  };
  if (typeof b.glyph === "string" && b.glyph.length === 1) o.glyph = b.glyph;
  if (typeof b.biome === "string") o.biome = b.biome;
  if (typeof b.name === "string") o.name = b.name;
  if (typeof b.kind === "string") o.kind = b.kind;
  if (typeof b.faction === "string") o.faction = b.faction;
  if (typeof b.desc === "string") o.desc = b.desc;
  if (typeof b.occludes === "number") o.occludes = b.occludes;
  if (typeof b.blocksMovement === "boolean") o.blocksMovement = b.blocksMovement;
  return o;
}

// ─── Route registration ──────────────────────────────────────────────────────

const RENDER_PREFIX = "/api/v1/map/realm/";
const PLAYER_PREFIX = "/api/v1/map/player/";
const OVERLAY_PREFIX = "/api/v1/map/overlay";

/** Exported for tests — handlers run before route registration side-effects. */
export async function handleRenderRoute(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  // /api/v1/map/realm/:id/render
  const tail = url.pathname.slice(RENDER_PREFIX.length);
  const match = /^([^/]+)\/render$/.exec(tail);
  if (!match) return Response.json({ error: "Not found" }, { status: 404 });
  const realm = match[1] || DEFAULT_REALM_FALLBACK;
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const parsed = parseRenderQuery(url);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }
  const body = await buildRenderResponse(realm, parsed.centre, parsed.radius);
  return Response.json(body);
}

export async function handlePlayerRoute(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const playerId = url.pathname.slice(PLAYER_PREFIX.length).replace(/\/+$/, "");
  if (!playerId) return Response.json({ error: "playerId required" }, { status: 400 });
  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }
  const actor = await dbojs.queryOne({ id: playerId });
  if (!actor) return Response.json({ error: "Not found" }, { status: 404 });
  const coordRaw = (actor as { data?: { coord?: unknown } }).data?.coord;
  if (!coordRaw || typeof coordRaw !== "object") {
    return Response.json({ error: "Player has no coord" }, { status: 404 });
  }
  const c = coordRaw as Record<string, unknown>;
  if (!Number.isFinite(c.x) || !Number.isFinite(c.y) || !Number.isFinite(c.z)) {
    return Response.json({ error: "Invalid coord" }, { status: 500 });
  }
  const coord: Coord = { x: c.x as number, y: c.y as number, z: c.z as number };
  const realm = typeof c.realm === "string" && c.realm.length > 0
    ? c.realm
    : DEFAULT_REALM_FALLBACK;
  const topo = createTopologyEngine(defaultMapConfig);
  const ov = await getOverlay(coord);
  const biome = ov?.biome ?? topo.sample(coord).biome.id;
  return Response.json({ realm, coord, biome });
}

export async function handleOverlayRoute(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (!(await isAdmin(userId))) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  if (req.method === "POST") {
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const parsed = parseOverlayBody(body);
    if ("error" in parsed) {
      return Response.json({ error: parsed.error }, { status: 400 });
    }
    try {
      await setOverlay(parsed);
    } catch (err) {
      return Response.json({ error: String(err) }, { status: 400 });
    }
    return Response.json({ overlay: parsed }, { status: 201 });
  }
  if (req.method === "DELETE") {
    const url = new URL(req.url);
    const x = Number(url.searchParams.get("x"));
    const y = Number(url.searchParams.get("y"));
    const z = Number(url.searchParams.get("z") ?? "0");
    if (![x, y, z].every(Number.isInteger)) {
      return Response.json({ error: "x, y, z must be integers" }, { status: 400 });
    }
    await clearOverlay({ x, y, z });
    return new Response(null, { status: 204 });
  }
  return Response.json({ error: "Method not allowed" }, { status: 405 });
}

let registered = false;

export function registerMapRoutes(): void {
  if (registered) return;
  registered = true;
  registerPluginRoute(RENDER_PREFIX, handleRenderRoute);
  registerPluginRoute(PLAYER_PREFIX, handlePlayerRoute);
  registerPluginRoute(OVERLAY_PREFIX, handleOverlayRoute);
}
