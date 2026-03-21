import { chargenApps, findAppByPlayer } from "./db.ts";
import type { IChargenApp } from "./db.ts";
import { dbojs } from "../../services/Database/index.ts";

// ─── helpers ─────────────────────────────────────────────────────────────────

const JSON_HEADERS = { "Content-Type": "application/json" };

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

async function isStaffUser(userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const player = await dbojs.queryOne({ id: userId });
  if (!player) return false;
  const flags = player.flags || "";
  return flags.includes("admin") || flags.includes("wizard") || flags.includes("superuser");
}

// ─── route handler ────────────────────────────────────────────────────────────

export async function chargenRouteHandler(req: Request, userId: string | null): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method;

  // ── GET /api/v1/chargen ──────────────────────────────────────────────────
  if (path === "/api/v1/chargen" && method === "GET") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    const params     = url.searchParams;
    const filterStatus = params.get("status") || null;

    let all = await chargenApps.find({});

    if (filterStatus) {
      all = all.filter(a => a.data.status === filterStatus);
    }

    // Default: show pending first, then others
    all.sort((a, b) => {
      const order: Record<string, number> = { pending: 0, rejected: 1, draft: 2, approved: 3 };
      return (order[a.data.status] ?? 99) - (order[b.data.status] ?? 99);
    });

    return jsonResponse(all);
  }

  // ── GET /api/v1/chargen/:playerId ────────────────────────────────────────
  const playerMatch = path.match(/^\/api\/v1\/chargen\/([^/]+)$/);
  if (playerMatch && method === "GET") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const playerId = playerMatch[1];

    const staff = await isStaffUser(userId);
    // Staff can view anyone; players can only view themselves
    if (!staff && userId !== playerId) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const app = await findAppByPlayer(playerId);
    if (!app) return jsonResponse({ error: "Not found" }, 404);

    return jsonResponse(app);
  }

  // ── PATCH /api/v1/chargen/:playerId ──────────────────────────────────────
  if (playerMatch && method === "PATCH") {
    if (!userId) return jsonResponse({ error: "Unauthorized" }, 401);
    const staff = await isStaffUser(userId);
    if (!staff) return jsonResponse({ error: "Forbidden" }, 403);

    const playerId = playerMatch[1];
    const app = await findAppByPlayer(playerId);
    if (!app) return jsonResponse({ error: "Not found" }, 404);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const ALLOWED_STATUS = new Set(["draft", "pending", "approved", "rejected"]);
    const patch: Partial<IChargenApp["data"]> = {};

    if (typeof body.status === "string") {
      if (!ALLOWED_STATUS.has(body.status)) {
        return jsonResponse({ error: "Invalid status value" }, 400);
      }
      patch.status = body.status as IChargenApp["data"]["status"];
    }
    if (typeof body.notes === "string") {
      patch.notes = body.notes;
    }
    if (body.reviewedBy !== undefined) {
      patch.reviewedBy = typeof body.reviewedBy === "string" ? body.reviewedBy : undefined;
    }
    if (body.reviewedAt !== undefined) {
      patch.reviewedAt = typeof body.reviewedAt === "number" ? body.reviewedAt : Date.now();
    }

    const updated: IChargenApp = {
      ...app,
      data: { ...app.data, ...patch },
    };
    await chargenApps.update({ id: app.id }, updated);
    return jsonResponse(updated);
  }

  return jsonResponse({ error: "Not Found" }, 404);
}
