/**
 * Channels staff REST.
 *
 * GET    /api/v1/channels
 * POST   /api/v1/channels
 * GET    /api/v1/channels/:id
 * PATCH  /api/v1/channels/:id
 * DELETE /api/v1/channels/:id
 * GET    /api/v1/channels/:id/history
 * GET    /api/v1/channels/:id/who
 */

import { dbojs } from "@ursamu/mush";
import { rooms, sessions } from "@ursamu/core";
import type { IChannel, IChanMessage } from "./types.ts";
import { chansDb, historyDb } from "./db.ts";
import { isStaffFlags } from "./staff-auth.ts";

const JSON_HEADERS = { "Content-Type": "application/json" };
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });

function slugId(name: string): string {
  return name.trim().toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "chan";
}

async function findChan(
  key: string,
): Promise<IChannel | null> {
  const chans = chansDb();
  const raw = decodeURIComponent(key).trim();
  const byId = await chans.queryOne({ id: raw });
  if (byId) return byId as IChannel;
  const byName = await chans.queryOne({ name: raw });
  if (byName) return byName as IChannel;
  // case-insensitive name scan
  const all = await chans.find({});
  const low = raw.toLowerCase();
  return all.find((c) =>
    c.id.toLowerCase() === low ||
    c.name.toLowerCase() === low
  ) ?? null;
}

function memberCount(chanName: string): number {
  try {
    return rooms.members(chanName).length;
  } catch {
    return 0;
  }
}

async function whoOn(
  chanName: string,
): Promise<{ id: string; name: string }[]> {
  let sockets: string[] = [];
  try {
    sockets = rooms.members(chanName);
  } catch {
    return [];
  }
  const seen = new Set<string>();
  const out: { id: string; name: string }[] = [];
  for (const sid of sockets) {
    const s = sessions.get(sid) as
      | { actorId?: string }
      | undefined;
    const id = String(s?.actorId ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const obj = await dbojs.queryOne({ id }).catch(() => null);
    const data = obj?.data as
      | { name?: string; moniker?: string }
      | undefined;
    out.push({
      id,
      name: data?.moniker ?? data?.name ?? id,
    });
  }
  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

function enrich(c: IChannel) {
  return {
    ...c,
    users: memberCount(c.name),
  };
}

export async function channelsRouteHandler(
  req: Request,
  userId: string | null,
): Promise<Response> {
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const user = await dbojs.queryOne({ id: userId });
  if (!user) return json({ error: "Unauthorized" }, 401);
  if (!isStaffFlags(user.flags)) {
    return json({ error: "Forbidden" }, 403);
  }

  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;
  const chans = chansDb();

  // Collection — note: core mush may own GET /api/v1/channels.
  // Staff UI accepts both bare arrays and { items }.
  if (path === "/api/v1/channels" || path === "/api/v1/channels/") {
    if (method === "GET") {
      const all = await chans.find({});
      all.sort((a, b) => a.name.localeCompare(b.name));
      const items = all.map(enrich);
      return json({ items, channels: items });
    }
    if (method === "POST") {
      return await createChan(req, chans, userId);
    }
    return json({ error: "Method not allowed" }, 405);
  }

  // Sub-resources. Use /messages (not /history) — core mush owns
  // GET /api/v1/channels/:id/history with a stricter gate.
  const m = path.match(
    /^\/api\/v1\/channels\/([^/]+)(?:\/(history|messages|who))?$/,
  );
  if (!m) return json({ error: "Not found" }, 404);
  const key = m[1];
  const sub = m[2];
  const chan = await findChan(key);
  if (!chan) return json({ error: "Not found" }, 404);

  if (
    (sub === "history" || sub === "messages") &&
    method === "GET"
  ) {
    return await getHistory(chan, url);
  }
  if (sub === "who" && method === "GET") {
    return json({ items: await whoOn(chan.name) });
  }
  if (sub) return json({ error: "Not found" }, 404);

  if (method === "GET") {
    return json(enrich(chan));
  }
  if (method === "PATCH") {
    return await patchChan(req, chans, chan);
  }
  if (method === "DELETE") {
    await chans.delete({ id: chan.id });
    return json({ ok: true });
  }
  return json({ error: "Method not allowed" }, 405);
}

async function createChan(
  req: Request,
  chans: ReturnType<typeof chansDb>,
  userId: string,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const name = String(body.name ?? "").trim();
  if (!name || name.length > 32) {
    return json({ error: "name required (max 32)" }, 400);
  }
  const existing = await findChan(name);
  if (existing) {
    return json({ error: "Channel already exists" }, 409);
  }
  let id = slugId(name);
  if (await chans.queryOne({ id })) {
    id = `${id}-${crypto.randomUUID().slice(0, 6)}`;
  }
  const row: IChannel = {
    id,
    name,
    header: String(body.header ?? `[${name.toUpperCase()}]`)
      .trim() || `[${name.toUpperCase()}]`,
    alias: String(body.alias ?? "").trim() || undefined,
    lock: String(body.lock ?? "").trim() || undefined,
    hidden: body.hidden === true,
    masking: body.masking === true,
    logHistory: body.logHistory === true,
    historyLimit: typeof body.historyLimit === "number"
      ? Math.min(Math.max(body.historyLimit, 1), 5000)
      : 500,
    announce: body.announce === true,
    autoJoin: body.autoJoin === true,
    owner: String(body.owner ?? userId).trim() || userId,
  };
  await chans.create(row);
  return json(enrich(row), 201);
}

async function patchChan(
  req: Request,
  chans: ReturnType<typeof chansDb>,
  chan: IChannel,
): Promise<Response> {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const patch: Record<string, unknown> = {};
  if (typeof body.header === "string") {
    patch.header = body.header.trim();
  }
  if (typeof body.alias === "string") {
    patch.alias = body.alias.trim();
  }
  if (typeof body.lock === "string") patch.lock = body.lock.trim();
  if (typeof body.owner === "string") {
    patch.owner = body.owner.trim();
  }
  if (typeof body.hidden === "boolean") patch.hidden = body.hidden;
  if (typeof body.masking === "boolean") {
    patch.masking = body.masking;
  }
  if (typeof body.logHistory === "boolean") {
    patch.logHistory = body.logHistory;
  }
  if (typeof body.announce === "boolean") {
    patch.announce = body.announce;
  }
  if (typeof body.autoJoin === "boolean") {
    patch.autoJoin = body.autoJoin;
  }
  if (typeof body.historyLimit === "number") {
    patch.historyLimit = Math.min(
      Math.max(Math.floor(body.historyLimit), 1),
      5000,
    );
  }
  if (typeof body.name === "string" && body.name.trim()) {
    const n = body.name.trim().slice(0, 32);
    if (n !== chan.name) {
      const clash = await findChan(n);
      if (clash && clash.id !== chan.id) {
        return json({ error: "Name in use" }, 409);
      }
      patch.name = n;
    }
  }
  if (!Object.keys(patch).length) {
    return json({ error: "Nothing to update" }, 400);
  }
  await chans.modify({ id: chan.id }, "$set", patch);
  const next = { ...chan, ...patch } as IChannel;
  return json(enrich(next));
}

async function getHistory(
  chan: IChannel,
  url: URL,
): Promise<Response> {
  const limit = Math.min(
    Math.max(
      parseInt(url.searchParams.get("limit") ?? "50", 10) || 50,
      1,
    ),
    500,
  );
  const hist = historyDb();
  const all = (await hist.find({ chanId: chan.id })) as
    IChanMessage[];
  all.sort((a, b) => b.timestamp - a.timestamp);
  return json({
    items: all.slice(0, limit),
    total: all.length,
  });
}
