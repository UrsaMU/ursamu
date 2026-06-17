/**
 * @module routes/players
 *
 * Player and channel REST endpoints:
 *   GET /api/v1/me                          — current user profile
 *   GET /api/v1/players/online              — connected players
 *   GET /api/v1/channels                    — channel list
 *   GET /api/v1/channels/:id/history        — channel message history (auth required)
 */

import { dbojs, chans, chanHistory, Obj } from "@ursamu/mush";

// ── helpers ───────────────────────────────────────────────────────────────────

const hasFlag = (flagStr: string, ...names: string[]): boolean => {
  const set = new Set(flagStr.split(/\s+/));
  return names.some((n) => set.has(n));
};

// ── GET /api/v1/me ────────────────────────────────────────────────────────────

export async function meHandler(_req: Request, userId: string): Promise<Response> {
  const user = await Obj.get(userId);
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = {
    id:      user.dbref,
    name:    user.name || "Unknown",
    moniker: (user.data?.moniker as string | undefined) || null,
    flags:   user.flags.split(" ").filter(Boolean),
    location: user.dbobj.location || null,
    avatar:  (user.data?.image as string | undefined) || null,
  };

  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

// ── GET /api/v1/players/online ────────────────────────────────────────────────

export async function onlinePlayersHandler(_req: Request): Promise<Response> {
  const connected = await dbojs.query({ flags: /connected/i });
  const players   = connected
    .filter((p) => hasFlag(p.flags, "player"))
    .map((p) => ({
      id:       p.id,
      name:     p.data?.name || "Unknown",
      moniker:  (p.data?.moniker as string | undefined) || null,
      location: p.location || null,
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
