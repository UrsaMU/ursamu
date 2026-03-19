import { dbojs, chans } from "../services/Database/index.ts";
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
