import type { ITransport } from "./types.ts";
import type { ICoreContext } from "../dispatch/types.ts";
import { runPipeline } from "../dispatch/pipeline.ts";
import { sessions } from "../session/store.ts";
import { registerSender, trackSocket, untrackSocket } from "../broadcast/send.ts";
import { gameHooks } from "../events/hooks.ts";
import { getConfig } from "../config/mod.ts";
import { log } from "../logging/index.ts";

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 1000;
const MAX_MSG_BYTES = 65536;

// Auth attempts are rate-limited more aggressively than regular commands.
const AUTH_RATE_LIMIT = 5;
const AUTH_RATE_WINDOW_MS = 60_000; // 5 attempts per minute per socket

interface RateEntry { count: number; resetAt: number; }
interface SocketMeta { socket: WebSocket; remoteIp: string; }

const _sockets = new Map<string, SocketMeta>();
const _rateLimits = new Map<string, RateEntry>();
const _authRateLimits = new Map<string, RateEntry>();
const _connectionsPerIp = new Map<string, Set<string>>();

/** Exported for security testing. */
export function isRateLimitedForAuth(socketId: string): boolean {
  const now = Date.now();
  const entry = _authRateLimits.get(socketId);
  if (!entry || now >= entry.resetAt) {
    _authRateLimits.set(socketId, { count: 1, resetAt: now + AUTH_RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > AUTH_RATE_LIMIT;
}

export function clampTermWidth(w: unknown): number | null {
  if (typeof w !== "number" || !Number.isFinite(w)) return null;
  if (w < 40 || w > 250) return null;
  return w;
}

function sendToSocket(socketId: string, msg: string): void {
  const meta = _sockets.get(socketId);
  if (!meta) return;
  try {
    meta.socket.send(JSON.stringify({ msg }));
  } catch (e: unknown) {
    log("warn", "ws:send-failed", { socketId, error: String(e) });
  }
}

function isRateLimited(socketId: string): boolean {
  const now = Date.now();
  const entry = _rateLimits.get(socketId);
  if (!entry || now >= entry.resetAt) {
    _rateLimits.set(socketId, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > RATE_LIMIT;
}

function trackIp(socketId: string, ip: string): void {
  let set = _connectionsPerIp.get(ip);
  if (!set) { set = new Set(); _connectionsPerIp.set(ip, set); }
  set.add(socketId);
}

function untrackIp(socketId: string, ip: string): void {
  const set = _connectionsPerIp.get(ip);
  if (!set) return;
  set.delete(socketId);
  if (set.size === 0) _connectionsPerIp.delete(ip);
}

function canConnect(ip: string): boolean {
  const max = getConfig<number>("server.maxConnections", 100);
  const set = _connectionsPerIp.get(ip);
  return !set || set.size < max;
}

function parseInput(raw: string): string {
  try {
    const data = JSON.parse(raw);
    if (data.type === "cmd" && typeof data.data === "string") return data.data;
    if (typeof data.msg === "string") return data.msg;
    return "";
  } catch {
    return raw;
  }
}

function handleAuth(socketId: string, raw: string): boolean {
  try {
    const data = JSON.parse(raw);
    if (data.type !== "auth" || typeof data.token !== "string") return false;
    // Check auth-specific rate limit BEFORE processing the token.
    if (isRateLimitedForAuth(socketId)) {
      log("warn", "ws:auth-rate-limited", { socketId });
      return true; // consume message, send no response
    }
    sessions.authenticate(socketId, data.token);
    gameHooks.emit("session:auth", { socketId, sessionId: data.token });
    log("info", "ws:auth", { socketId });
    return true;
  } catch {
    return false;
  }
}

async function handleMessage(socketId: string, raw: string): Promise<void> {
  if (raw.length > MAX_MSG_BYTES) return;

  if (handleAuth(socketId, raw)) return;

  const input = parseInput(raw).trim();
  if (!input) return;

  if (isRateLimited(socketId)) {
    log("warn", "ws:rate-limited", { socketId });
    return;
  }

  sessions.touch(socketId);
  const session = sessions.get(socketId);
  const ctx: ICoreContext = {
    socketId,
    sessionId: session?.sessionId ?? null,
    input,
    args: [],
    send: (msg: string) => sendToSocket(socketId, msg),
  };

  try {
    await runPipeline(ctx);
  } catch (e: unknown) {
    log("error", "ws:pipeline-error", { socketId, error: String(e) });
  }
}

async function handleClose(socketId: string): Promise<void> {
  const meta = _sockets.get(socketId);
  if (!meta) return;
  const session = sessions.get(socketId);
  const sessionId = session?.sessionId ?? null;
  _sockets.delete(socketId);
  _rateLimits.delete(socketId);
  _authRateLimits.delete(socketId);
  untrackSocket(socketId);
  if (meta.remoteIp) untrackIp(socketId, meta.remoteIp);
  sessions.close(socketId);
  await gameHooks.emit("session:close", { socketId, sessionId });
  log("info", "ws:close", { socketId });
}

export function handleWebSocketConnection(
  socket: WebSocket,
  remoteIp = "",
): string | null {
  if (!canConnect(remoteIp)) {
    socket.close(1008, "Too many connections");
    return null;
  }

  const socketId = crypto.randomUUID();
  _sockets.set(socketId, { socket, remoteIp });
  trackSocket(socketId);
  if (remoteIp) trackIp(socketId, remoteIp);

  const open = async () => {
    sessions.open(socketId, "");
    await gameHooks.emit("session:open", { socketId });
    log("info", "ws:open", { socketId, remoteIp });
  };

  if (socket.readyState === WebSocket.OPEN) {
    open();
  } else {
    socket.addEventListener("open", open);
  }

  socket.addEventListener("message", async (event) => {
    if (typeof event.data !== "string") return;
    await handleMessage(socketId, event.data);
  });

  socket.addEventListener("close", () => { handleClose(socketId); });

  socket.addEventListener("error", (e) => {
    log("error", "ws:error", { socketId, error: String(e) });
  });

  return socketId;
}

let _server: Deno.HttpServer | null = null;

export const websocketTransport: ITransport = {
  name: "websocket",

  start(): Promise<void> {
    registerSender(sendToSocket);
    const port = getConfig<number>("server.wsPort", 4203);
    _server = Deno.serve({ port }, (req) => {
      const upgrade = req.headers.get("upgrade");
      if (upgrade?.toLowerCase() !== "websocket") {
        return new Response("Upgrade required", { status: 426 });
      }
      const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "";
      const { socket, response } = Deno.upgradeWebSocket(req);
      handleWebSocketConnection(socket, ip);
      return response;
    });
    log("info", "ws:start", { port });
    return Promise.resolve();
  },

  async stop(): Promise<void> {
    if (_server) {
      await _server.shutdown();
      _server = null;
    }
    log("info", "ws:stop", {});
  },
};
