import { chars } from "./schema.ts";
import { derivedStats } from "./derived.ts";

/**
 * Handler for all /api/v1/mekton-zeta routes.
 * Note: this route persists until server restart and cannot be hot-unloaded.
 *
 * GET /api/v1/mekton-zeta              — list all characters (admin use)
 * GET /api/v1/mekton-zeta/:playerId    — get own character + derived stats
 */
export async function routeHandler(req: Request, userId: string | null): Promise<Response> {
  if (!userId) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const url   = new URL(req.url);
  const parts = url.pathname.replace(/^\/api\/v1\/mekton-zeta\/?/, "").split("/").filter(Boolean);

  if (req.method !== "GET") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  if (parts.length === 0) {
    const all = await chars.find({});
    return Response.json(all.map((c) => ({
      id: c.id,
      playerName: c.playerName,
      chargenStatus: c.chargenStatus,
      charType: c.charType,
    })));
  }

  if (parts.length === 1) {
    const playerId = parts[0];
    if (playerId !== userId) return Response.json({ error: "Forbidden" }, { status: 403 });
    const char = await chars.findOne({ playerId });
    if (!char) return Response.json({ error: "Not found" }, { status: 404 });
    return Response.json({ ...char, derived: derivedStats(char) });
  }

  return Response.json({ error: "Not found" }, { status: 404 });
}
