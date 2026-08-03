/**
 * Admin WS client hub — connect, auth, RPC, broadcast.
 */

import { verifyToken, dbojs } from "@ursamu/mush";
import { buildSnapshot, runAdminRpc } from "./admin-ws-rpc.ts";

export type OnlineRow = {
  id: string;
  name: string;
  moniker: string | null;
};

export type AdminWsMsg =
  | { type: "hello"; at: number }
  | { type: "pong"; at: number }
  | { type: "error"; message: string }
  | { type: "snapshot"; at: number; data: Record<string, unknown> }
  | {
    type: "res";
    id: string;
    status: number;
    data: unknown;
  }
  | { type: "wiki:upsert"; page: Record<string, unknown> }
  | { type: "wiki:delete"; path: string }
  | { type: "job:upsert"; job: Record<string, unknown> }
  | { type: "job:delete"; id: string; number?: number }
  | { type: "object:upsert"; object: Record<string, unknown> }
  | { type: "object:delete"; id: string }
  | { type: "board:upsert"; board: Record<string, unknown> }
  | {
    type: "board:delete";
    id: string;
    num?: number;
  }
  | { type: "online:set"; players: OnlineRow[] }
  | {
    type: "badge:set";
    key: string;
    value: string;
    title?: string;
  }
  | {
    type: "staff:chrome";
    staffNav: unknown;
    staffSideNav: unknown;
  };

interface Client {
  id: string;
  socket: WebSocket;
  userId: string;
  token: string;
  authed: boolean;
}

const STAFF = new Set(["admin", "wizard", "superuser"]);
const AUTH_TIMEOUT_MS = 8_000;
/** Wiki bodies + JSON RPC — 1 MiB. */
const MAX_MSG = 1_048_576;

const _clients = new Map<string, Client>();

function flagSet(raw: unknown): Set<string> {
  if (raw instanceof Set) {
    return new Set([...raw].map(String));
  }
  if (Array.isArray(raw)) return new Set(raw.map(String));
  if (typeof raw === "string") {
    return new Set(
      raw.split(/[\s,|]+/).map((s) => s.trim()).filter(Boolean),
    );
  }
  return new Set();
}

export function isStaffFlags(flags: Set<string>): boolean {
  for (const f of STAFF) if (flags.has(f)) return true;
  return false;
}

export { flagSet };

export async function resolveStaffUserId(
  token: string,
): Promise<string | null> {
  try {
    const payload = await verifyToken(token);
    if (payload?.id == null || payload.id === "") return null;
    const userId = String(payload.id);
    const row = await dbojs.queryOne({ id: userId });
    if (!row) {
      const bare = userId.replace(/^#/, "");
      const again = await dbojs.queryOne({ id: bare });
      if (!again || !isStaffFlags(flagSet(again.flags))) return null;
      return bare;
    }
    if (!isStaffFlags(flagSet(row.flags))) return null;
    return userId;
  } catch {
    return null;
  }
}

function send(c: Client, msg: AdminWsMsg): void {
  if (c.socket.readyState !== WebSocket.OPEN) return;
  try {
    c.socket.send(JSON.stringify(msg));
  } catch {
    /* closed mid-send */
  }
}

/** Broadcast to every authenticated staff socket. */
export function broadcastAdmin(msg: AdminWsMsg): void {
  for (const c of _clients.values()) {
    if (!c.authed) continue;
    send(c, msg);
  }
}

export function adminClientCount(): number {
  let n = 0;
  for (const c of _clients.values()) if (c.authed) n++;
  return n;
}

function drop(id: string): void {
  _clients.delete(id);
}

export function closeAllClients(): void {
  for (const c of _clients.values()) {
    try {
      c.socket.close(1000, "shutdown");
    } catch { /* */ }
  }
  _clients.clear();
}

export function wikiPageStub(
  path: string,
  meta: Record<string, unknown>,
  body?: string,
): Record<string, unknown> {
  const tags = Array.isArray(meta.tags)
    ? (meta.tags as unknown[]).map(String)
    : [];
  return {
    path,
    title: typeof meta.title === "string" ? meta.title : path,
    type: "page",
    draft: meta.draft === true,
    author: typeof meta.author === "string" ? meta.author : "",
    date: typeof meta.date === "string" ? meta.date : "",
    readLock: typeof meta.readLock === "string"
      ? meta.readLock
      : "connected",
    tags,
    chars: typeof body === "string" ? body.length : 0,
  };
}

function plainMoniker(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  const plain = raw
    .replace(/%c[a-z0-9#]*/gi, "")
    .replace(/%[rntb]/gi, "")
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/<#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})>/g, "")
    .trim();
  return plain || null;
}

export async function collectOnline(): Promise<OnlineRow[]> {
  try {
    const connected = await dbojs.query({ flags: /connected/i });
    return connected
      .filter((p: { flags?: unknown }) =>
        flagSet(p.flags).has("player")
      )
      .map((p: {
        id?: unknown;
        data?: { name?: unknown; moniker?: unknown };
      }) => ({
        id: String(p.id),
        name: String(p.data?.name ?? "Unknown"),
        moniker: plainMoniker(p.data?.moniker),
      }));
  } catch {
    return [];
  }
}

export async function pushOnline(): Promise<void> {
  if (adminClientCount() === 0) return;
  const players = await collectOnline();
  broadcastAdmin({ type: "online:set", players });
}

async function handleRpc(
  client: Client,
  data: Record<string, unknown>,
): Promise<void> {
  const id = typeof data.id === "string" ? data.id : "";
  if (!id) return;
  const method = typeof data.method === "string"
    ? data.method
    : "GET";
  const path = typeof data.path === "string" ? data.path : "";
  if (!path) {
    send(client, {
      type: "res",
      id,
      status: 400,
      data: { error: "path required" },
    });
    return;
  }

  const result = await runAdminRpc(
    client.token,
    method,
    path,
    data.body,
    `ws:${client.id}`,
  );
  send(client, {
    type: "res",
    id,
    status: result.status,
    data: result.data,
  });
  // Live fan-out is hook-driven (object:modified, wikiHooks, …).
}

async function pushSnapshot(client: Client): Promise<void> {
  try {
    const snap = await buildSnapshot(
      client.token,
      `ws:${client.id}`,
    );
    send(client, {
      type: "snapshot",
      at: Date.now(),
      data: snap as unknown as Record<string, unknown>,
    });
  } catch (e: unknown) {
    send(client, {
      type: "error",
      message: `snapshot failed: ${String(e)}`,
    });
  }
}

export function attachSocket(
  socket: WebSocket,
  preAuth: { userId: string; token: string } | null,
): void {
  const id = crypto.randomUUID();
  const client: Client = {
    id,
    socket,
    userId: preAuth?.userId ?? "",
    token: preAuth?.token ?? "",
    authed: false,
  };
  _clients.set(id, client);

  let authTimer: ReturnType<typeof setTimeout> | undefined;

  const markAuthed = (userId: string, token: string) => {
    if (authTimer !== undefined) clearTimeout(authTimer);
    client.userId = userId;
    client.token = token;
    client.authed = true;
    send(client, { type: "hello", at: Date.now() });
    void pushSnapshot(client);
  };

  if (preAuth) {
    const go = () => markAuthed(preAuth.userId, preAuth.token);
    if (socket.readyState === WebSocket.OPEN) go();
    else socket.addEventListener("open", go, { once: true });
  } else {
    authTimer = setTimeout(() => {
      if (!client.authed) {
        try {
          socket.close(4001, "auth timeout");
        } catch { /* */ }
        drop(id);
      }
    }, AUTH_TIMEOUT_MS);
  }

  socket.onmessage = async (ev) => {
    if (typeof ev.data !== "string") return;
    if (ev.data.length > MAX_MSG) return;
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(ev.data) as Record<string, unknown>;
    } catch {
      return;
    }

    if (data.type === "ping") {
      send(client, { type: "pong", at: Date.now() });
      return;
    }

    if (data.type === "auth" && !client.authed) {
      const token = typeof data.token === "string" ? data.token : "";
      const uid = token ? await resolveStaffUserId(token) : null;
      if (!uid) {
        send(client, { type: "error", message: "Unauthorized" });
        try {
          socket.close(4003, "forbidden");
        } catch { /* */ }
        drop(id);
        return;
      }
      markAuthed(uid, token);
      return;
    }

    if (data.type === "req" && client.authed) {
      await handleRpc(client, data);
      return;
    }

    if (data.type === "snapshot" && client.authed) {
      await pushSnapshot(client);
    }
  };

  socket.addEventListener("close", () => drop(id));
  socket.addEventListener("error", () => {
    try {
      socket.close();
    } catch { /* */ }
    drop(id);
  });
}
