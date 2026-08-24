/** REST /api/v1/sprawl — sheet, catalog, gig room art. */
import { dbojs } from "@ursamu/ursamu";
import { readSprawl } from "./db/schemas.ts";
import {
  ANTAGONISTS,
  AUGS,
  FIREARMS,
  FLOW_LOCATIONS,
  HEAVY,
  MARKET,
  NARCOTICS,
  SHOWROOM,
  MELEE,
  ARMOR,
  GIG_ROOMS,
} from "./engine/catalog.ts";
import {
  gigRoomArtCatalog,
  listGigRoomArt,
  setGigRoomArt,
} from "./engine/gig-art.ts";

async function isStaffUser(userId: string): Promise<boolean> {
  const obj = await dbojs.queryOne({ id: userId });
  if (!obj) return false;
  const fl = String(
    (obj as { flags?: string }).flags ?? "",
  ).toLowerCase();
  return (
    fl.includes("wizard") ||
    fl.includes("admin") ||
    fl.includes("superuser") ||
    fl.includes("staff")
  );
}

export async function routeHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) {
    return Response.json(
      { error: "Unauthorized" },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/api\/v1\/sprawl/, "") ||
    "/";

  if (req.method === "GET" && path.startsWith("/sheet/")) {
    const id = path.slice("/sheet/".length).split("/")[0];
    if (!id) {
      return Response.json({ error: "Missing id" }, { status: 400 });
    }
    const obj = await dbojs.queryOne({ id });
    if (!obj) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }
    const sheet = readSprawl(
      obj.state as Record<string, unknown> | undefined,
    );
    return Response.json({ id, sheet });
  }

  if (req.method === "GET" && path.startsWith("/catalog/")) {
    const kind = path.slice("/catalog/".length).split("/")[0];
    const tables: Record<string, unknown> = {
      firearms: FIREARMS,
      melee: MELEE,
      armor: ARMOR,
      heavy: HEAVY,
      augs: AUGS,
      market: MARKET,
      flow: FLOW_LOCATIONS,
      narcotics: NARCOTICS,
      showroom: SHOWROOM,
      antagonists: ANTAGONISTS,
      "gig-rooms": GIG_ROOMS,
    };
    if (!kind || !(kind in tables)) {
      return Response.json(
        { error: "Unknown catalog", keys: Object.keys(tables) },
        { status: 400 },
      );
    }
    return Response.json({ kind, items: tables[kind] });
  }

  // Staff: gig room type images
  if (
    (req.method === "GET" || req.method === "PUT") &&
    (path === "/gig-rooms" || path === "/gig-rooms/")
  ) {
    if (!(await isStaffUser(userId))) {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }
    if (req.method === "GET") {
      const rooms = await gigRoomArtCatalog();
      const art = await listGigRoomArt();
      return Response.json({ rooms, art });
    }
    try {
      const body = await req.json() as {
        slug?: string;
        image?: string;
        bySlug?: Record<string, string>;
      };
      if (body.bySlug && typeof body.bySlug === "object") {
        for (const [slug, image] of Object.entries(body.bySlug)) {
          await setGigRoomArt(slug, String(image ?? "clear"));
        }
      } else if (body.slug != null) {
        await setGigRoomArt(
          String(body.slug),
          String(body.image ?? "clear"),
        );
      } else {
        return Response.json(
          { error: "Need slug+image or bySlug map" },
          { status: 400 },
        );
      }
      const rooms = await gigRoomArtCatalog();
      return Response.json({ ok: true, rooms });
    } catch (e: unknown) {
      return Response.json(
        {
          error: e instanceof Error ? e.message : "Bad request",
        },
        { status: 400 },
      );
    }
  }

  if (req.method === "GET" && path === "/") {
    return Response.json({
      ok: true,
      system: "sprawl-goons",
      version: "1.0.0",
      endpoints: [
        "/sheet/:id",
        "/catalog/:kind",
        "/gig-rooms",
      ],
    });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
