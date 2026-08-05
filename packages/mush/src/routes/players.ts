/**
 * @module routes/players
 *
 * Player and channel REST endpoints:
 *   GET /api/v1/me                          — current user profile
 *   GET /api/v1/players/online              — connected players
 *   GET /api/v1/channels                    — channel list
 *   GET /api/v1/channels/:id/history        — channel message history (auth required)
 */

import { dbojs, chans, chanHistory, Obj } from "../world/dbobjs.ts";
import { stripAnsi } from "../softcode/stdlib/helpers.ts";
import { monikerToHtml } from "../render/moniker-html.ts";
import { resolveAvatarUrl } from "./avatar-url.ts";

// ── helpers ───────────────────────────────────────────────────────────────────

const hasFlag = (flagStr: string, ...names: string[]): boolean => {
  const set = new Set(flagStr.split(/\s+/));
  return names.some((n) => set.has(n));
};

/** Plain-text moniker for web / API clients (no %c or ANSI). */
function plainMoniker(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const plain = stripAnsi(raw)
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    .trim();
  return plain || null;
}

/** Raw moniker from data or state (may include %c / <#rrggbb>). */
function rawMoniker(user: {
  data?: Record<string, unknown>;
  dbobj?: { data?: Record<string, unknown>; state?: Record<string, unknown> };
  state?: Record<string, unknown>;
}): unknown {
  return user.data?.moniker ??
    user.dbobj?.data?.moniker ??
    user.state?.moniker ??
    user.dbobj?.state?.moniker;
}

// ── GET /api/v1/me ────────────────────────────────────────────────────────────

/** Normalize flags from string | Set | string[] → string[]. */
export function normalizeFlagList(raw: unknown): string[] {
  if (raw instanceof Set) {
    return [...raw].map((f) => String(f)).filter(Boolean);
  }
  if (Array.isArray(raw)) {
    return raw.map((f) => String(f)).filter(Boolean);
  }
  if (typeof raw === "string") {
    return raw.split(/[\s,|]+/).map((f) => f.trim()).filter(Boolean);
  }
  return [];
}

export async function meHandler(_req: Request, userId: string): Promise<Response> {
  const user = await Obj.get(userId);
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Prefer raw dbobj.flags — getter may be Set or string depending on path.
  const rawFlags = (user.dbobj as { flags?: unknown })?.flags ??
    user.flags;

  // Plain character name — not moniker (Obj.name prefers moniker).
  const plainName =
    String(user.data?.name ?? user.dbobj?.data?.name ?? "").trim() ||
    "Unknown";

  const monikerRaw = rawMoniker(user);
  const monikerPlain = plainMoniker(monikerRaw);
  const monikerHtml = monikerToHtml(monikerRaw);

  // Avatar: local @avatar file (/avatars/{id}.ext) or legacy image URL.
  // user.id is bare numeric/string id; dbref is "#n".
  const bag = (user.data ??
    user.dbobj?.data ??
    {}) as Record<string, unknown>;
  const avatar = await resolveAvatarUrl(user.id, bag);

  const profile = {
    id: user.dbref,
    // Numeric id for clients that need it (wiki admin JWT is this id)
    dbId: user.id,
    name: plainName,
    /** Plain display moniker (no color codes). */
    moniker: monikerPlain,
    /** Colored moniker as safe HTML (web-safe palette spans). */
    monikerHtml,
    flags: normalizeFlagList(rawFlags),
    location: user.dbobj.location || null,
    avatar,
  };

  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /api/v1/players/online ────────────────────────────────────────────────

export async function onlinePlayersHandler(_req: Request): Promise<Response> {
  const connected = await dbojs.query({ flags: /connected/i });
  // Public listing — do not expose room location (privacy).
  const players   = connected
    .filter((p) => hasFlag(p.flags, "player"))
    .map((p) => ({
      id:       p.id,
      name:     p.data?.name || "Unknown",
      moniker:  plainMoniker(p.data?.moniker),
    }));

  return new Response(JSON.stringify(players), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /api/v1/channels ──────────────────────────────────────────────────────

export async function channelsHandler(_req: Request): Promise<Response> {
  const channels = await chans.all();
  const list = channels.map((c) => ({
    id:         c.id,
    name:       c.name,
    alias:      (c as Record<string, unknown>).alias || null,
    header:     (c as Record<string, unknown>).header || null,
    lock:       (c as Record<string, unknown>).lock || null,
    logHistory: (c as Record<string, unknown>).logHistory ?? false,
  }));

  return new Response(JSON.stringify(list), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /api/v1/channels/:id/history ─────────────────────────────────────────

export async function channelHistoryHandler(req: Request, channelId: string): Promise<Response> {
  const chan = await chans.queryOne({ id: channelId });
  if (!chan) {
    return new Response(JSON.stringify({ error: "Channel not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!(chan as Record<string, unknown>).logHistory) {
    return new Response(JSON.stringify({ error: "History is not enabled for this channel." }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const url   = new URL(req.url);
  const limit = Math.max(Math.min(parseInt(url.searchParams.get("limit") || "20", 10) || 20, 500), 1);
  const all   = await chanHistory.find({ chanId: channelId });
  all.sort((a: Record<string, unknown>, b: Record<string, unknown>) =>
    (a.timestamp as number) - (b.timestamp as number)
  );
  const slice = all.slice(-limit);

  return new Response(JSON.stringify(slice), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
