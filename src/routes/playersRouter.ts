import { dbojs, chans, chanHistory } from "../services/Database/index.ts";
import { Obj } from "../services/DBObjs/DBObjs.ts";

/** GET /api/v1/me — current user profile from JWT */
export const meHandler = async (_req: Request, userId: string): Promise<Response> => {
  const user = await Obj.get(userId);
  if (!user) {
    return new Response(JSON.stringify({ error: "User not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }

  const profile = {
    id: user.dbref,
    name: user.name || "Unknown",
    moniker: (user.data?.moniker as string | undefined) || null,
    flags: user.flags.split(" ").filter(Boolean),
    location: user.dbobj.location || null,
    avatar: (user.data?.image as string | undefined) || null,
  };

  return new Response(JSON.stringify(profile), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** GET /api/v1/players/online — list of currently connected players */
export const onlinePlayersHandler = async (_req: Request): Promise<Response> => {
  const connected = await dbojs.query({ flags: /connected/i });
  const players = connected
    .filter((p) => p.flags.includes("player"))
    .map((p) => ({
      id: p.id,
      name: p.data?.name || "Unknown",
      moniker: (p.data?.moniker as string | undefined) || null,
      location: p.location || null,
    }));

  return new Response(JSON.stringify(players), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/** GET /api/v1/channels — list of all channels */
export const channelsHandler = async (_req: Request): Promise<Response> => {
  const channels = await chans.all();
  const list = channels.map((c) => ({
    id: c.id,
    name: c.name,
    alias: c.alias || null,
    header: c.header || null,
    lock: c.lock || null,
  }));

  return new Response(JSON.stringify(list), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};

/**
 * GET /api/v1/channels/:id/history?limit=50
 * Returns persisted history for a channel. `id` may be the channel's `id`
 * field or its `name`. Returns 404 if the channel is not found, 403 if
 * logging is disabled on that channel.
 */
export const channelHistoryHandler = async (req: Request, idOrName: string): Promise<Response> => {
  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10), 1), 500);

  // Try id first, then name
  const chan = await chans.queryOne({ id: idOrName }) ?? await chans.queryOne({ name: idOrName });
  if (!chan) {
    return new Response(JSON.stringify({ error: "Channel not found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  }
  if (!chan.logHistory) {
    return new Response(JSON.stringify({ error: "History logging is not enabled for this channel" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const all = await chanHistory.query({ chanId: chan.id });
  const page = all
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit)
    .reverse()
    .map(({ playerName, message, timestamp }) => ({ playerName, message, timestamp }));

  return new Response(JSON.stringify(page), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
};
