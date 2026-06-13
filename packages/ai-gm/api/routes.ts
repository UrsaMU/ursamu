// ─── REST API Routes ──────────────────────────────────────────────────────────
//
// Exposes AI-GM data for a future web UI.
// All routes are prefixed with /api/gm.
//
// Authentication: Bearer token checked against GM_API_SECRET env var.
// When GM_API_SECRET is not set, all routes are open (dev mode).
//
// Routes:
//   GET  /api/gm/status            — health + config summary
//   GET  /api/gm/sessions          — list sessions
//   GET  /api/gm/sessions/:id      — single session + exchanges
//   GET  /api/gm/journal           — list journal entries
//   GET  /api/gm/journal/:id       — single journal entry
//   GET  /api/gm/spotlights        — list spotlights (query: ?playerId=)
//   GET  /api/gm/wallets/:playerId — player wallet + balance
//   GET  /api/gm/plans             — list subscription plans
//   POST /api/gm/webhook           — Stripe webhook (no auth check — uses signature)
//   POST /api/gm/credits/grant     — admin: grant credits { playerId, amount }

import { loadConfig } from "../providers.ts";
import { gmExchanges, gmSessions } from "../db.ts";
import type { IGMExchange, IGMSession } from "../schema.ts";
import { getJournalEntries, getJournalEntry } from "../social/journal.ts";
import { getSpotlights } from "../social/spotlight.ts";
import { getWallet } from "../monetization/credits.ts";
import { getPlans } from "../monetization/plans.ts";

// ─── Auth middleware ──────────────────────────────────────────────────────────

const API_SECRET = Deno.env.get("GM_API_SECRET") ?? "";

function authorized(req: Request): boolean {
  if (!API_SECRET) return true; // dev mode — no secret set
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  return token === API_SECRET;
}

function forbidden(): Response {
  return json({ error: "Unauthorized" }, 401);
}

// ─── Response helpers ─────────────────────────────────────────────────────────

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "X-GM-Version": "0.1.0",
    },
  });
}

function notFound(msg = "Not found"): Response {
  return json({ error: msg }, 404);
}

// ─── Route table ─────────────────────────────────────────────────────────────

export type GmWebhookHandler = (req: Request) => Promise<Response>;

export interface IGmApiOptions {
  webhookHandler?: GmWebhookHandler;
  adminCreditGrantFn?: (
    playerId: string,
    amount: number,
  ) => Promise<number>;
}

/**
 * Main dispatcher. Match pattern: /api/gm/<resource>[/<id>]
 * Returns null if the path is not an AI-GM route (caller should fall through).
 */
export async function handleGmRequest(
  req: Request,
  opts: IGmApiOptions = {},
): Promise<Response | null> {
  const url = new URL(req.url);
  const path = url.pathname;

  if (!path.startsWith("/api/gm")) return null;

  const segments = path.replace(/^\/api\/gm\/?/, "").split("/").filter(Boolean);
  const [resource, id] = segments;
  const method = req.method.toUpperCase();

  // ── POST /api/gm/webhook — no auth, uses Stripe signature ────────────────
  if (method === "POST" && resource === "webhook") {
    if (!opts.webhookHandler) {
      return json({ error: "Webhook not configured" }, 503);
    }
    return opts.webhookHandler(req);
  }

  // ── Auth check for all other routes ──────────────────────────────────────
  if (!authorized(req)) return forbidden();

  // ── GET /api/gm/status ────────────────────────────────────────────────────
  if (method === "GET" && resource === "status" && !id) {
    const cfg = await loadConfig();
    return json({
      ok: true,
      system: cfg.systemId,
      model: cfg.model,
      mode: cfg.mode,
      booksDir: cfg.booksDir,
      // never expose apiKey
    });
  }

  // ── GET /api/gm/sessions ──────────────────────────────────────────────────
  if (method === "GET" && resource === "sessions" && !id) {
    const sessions = (await gmSessions.all()) as IGMSession[];
    return json(sessions.sort((a, b) => b.openedAt - a.openedAt));
  }

  // ── GET /api/gm/sessions/:id ──────────────────────────────────────────────
  if (method === "GET" && resource === "sessions" && id) {
    const session = await gmSessions.queryOne(
      { id } as Parameters<typeof gmSessions.queryOne>[0],
    ) as IGMSession | null;
    if (!session) return notFound(`Session "${id}" not found.`);

    // IGMExchange has no sessionId; approximate by timestamp window of the session.
    const sessionEnd = session.closedAt ?? Date.now();
    const exchanges = (
      (await gmExchanges.all()) as IGMExchange[]
    ).filter((e) =>
      e.timestamp >= session.openedAt && e.timestamp <= sessionEnd
    )
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(0, 200);

    return json({ session, exchanges });
  }

  // ── GET /api/gm/journal ───────────────────────────────────────────────────
  if (method === "GET" && resource === "journal" && !id) {
    const limit = parseInt(url.searchParams.get("limit") ?? "20", 10);
    const entries = await getJournalEntries(Math.min(limit, 100));
    return json(entries);
  }

  // ── GET /api/gm/journal/:id ───────────────────────────────────────────────
  if (method === "GET" && resource === "journal" && id) {
    const entry = await getJournalEntry(id);
    if (!entry) return notFound(`Journal entry "${id}" not found.`);
    return json(entry);
  }

  // ── GET /api/gm/spotlights ────────────────────────────────────────────────
  if (method === "GET" && resource === "spotlights") {
    const playerId = url.searchParams.get("playerId") ?? undefined;
    const sessionId = url.searchParams.get("sessionId") ?? undefined;
    const limit = parseInt(url.searchParams.get("limit") ?? "50", 10);
    const entries = await getSpotlights({
      playerId,
      sessionId,
      limit: Math.min(limit, 200),
    });
    return json(entries);
  }

  // ── GET /api/gm/wallets/:playerId ─────────────────────────────────────────
  if (method === "GET" && resource === "wallets" && id) {
    const wallet = await getWallet(id);
    return json(wallet);
  }

  // ── GET /api/gm/plans ─────────────────────────────────────────────────────
  if (method === "GET" && resource === "plans") {
    return json(getPlans());
  }

  // ── POST /api/gm/credits/grant ────────────────────────────────────────────
  if (method === "POST" && resource === "credits" && id === "grant") {
    if (!opts.adminCreditGrantFn) return json({ error: "Not configured" }, 503);
    let body: { playerId?: string; amount?: number };
    try {
      body = await req.json() as typeof body;
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }
    if (!body.playerId || typeof body.amount !== "number" || body.amount < 1) {
      return json({
        error: "Required: { playerId: string, amount: number (>0) }",
      }, 400);
    }
    const newBalance = await opts.adminCreditGrantFn(
      body.playerId,
      body.amount,
    );
    return json({ playerId: body.playerId, newBalance });
  }

  return null; // route not matched
}
