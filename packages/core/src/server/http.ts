import type { ITransport } from "./types.ts";
import type { ICoreContext } from "../dispatch/types.ts";
import { runPipeline } from "../dispatch/pipeline.ts";
import { sessions } from "../session/store.ts";
import { trackSocket, untrackSocket } from "../broadcast/send.ts";
import { gameHooks } from "../events/hooks.ts";
import { getConfig } from "../config/mod.ts";
import { log } from "../logging/index.ts";

type RouteHandler = (req: Request, params: Record<string, string>) => Promise<Response>;

interface RouteEntry { method: string; path: string; handler: RouteHandler; }
interface RateEntry  { count: number; resetAt: number; }

const HTTP_RATE_LIMIT    = 10;
const HTTP_RATE_WINDOW   = 1000;

const _routes: RouteEntry[] = [];
const _sseStreams = new Map<string, ReadableStreamDefaultController<Uint8Array>>();
const _rateLimits = new Map<string, RateEntry>();
const enc = new TextEncoder();

// Fallback handler — catches any request not matched by built-in routes or registerRoute().
// Used to forward REST API requests to the application layer (e.g. app.ts handleRequest).
type FallbackHandler = (req: Request, remoteAddr?: string) => Promise<Response>;
let _fallback: FallbackHandler | null = null;

export function registerFallback(fn: FallbackHandler): void {
  _fallback = fn;
}

function isRateLimited(socketId: string): boolean {
  const now   = Date.now();
  const entry = _rateLimits.get(socketId);
  if (!entry || now >= entry.resetAt) {
    _rateLimits.set(socketId, { count: 1, resetAt: now + HTTP_RATE_WINDOW });
    return false;
  }
  entry.count++;
  return entry.count > HTTP_RATE_LIMIT;
}

export function registerRoute(method: string, path: string, handler: RouteHandler): void {
  _routes.push({ method: method.toUpperCase(), path, handler });
}

function sseEvent(msg: string): Uint8Array {
  return enc.encode(`data: ${msg}\n\n`);
}

function matchRoute(method: string, pathname: string): { entry: RouteEntry; params: Record<string, string> } | null {
  for (const entry of _routes) {
    if (entry.method !== method) continue;
    if (entry.path === pathname) return { entry, params: {} };
  }
  return null;
}

function handleHealth(): Response {
  return Response.json({ status: "ok" });
}

function handleSse(socketId: string): Response {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      _sseStreams.set(socketId, controller);
      trackSocket(socketId);
      sessions.open(socketId, "");
      gameHooks.emit("session:open", { socketId });
      log("info", "sse:open", { socketId });
    },
    cancel() {
      closeSse(socketId);
    },
  });
  return new Response(stream, {
    headers: {
      "content-type":  "text/event-stream",
      "cache-control": "no-cache",
      "connection":    "keep-alive",
      // Client reads this to learn its server-assigned ID for POST /input.
      "x-socket-id":   socketId,
    },
  });
}

function closeSse(socketId: string): void {
  _sseStreams.delete(socketId);
  _rateLimits.delete(socketId);
  untrackSocket(socketId);
  const session = sessions.get(socketId);
  const sessionId = session?.sessionId ?? null;
  const actorId = (session as { actorId?: string | null })?.actorId ?? null;
  gameHooks.emit("session:close", { socketId, sessionId, actorId });
  sessions.close(socketId);
  log("info", "sse:close", { socketId });
}

async function handleInput(req: Request): Promise<Response> {
  const socketId = req.headers.get("x-socket-id") ?? "";
  if (!socketId) return new Response("x-socket-id required", { status: 400 });

  let body: Record<string, unknown>;
  try {
    body = await req.json() as Record<string, unknown>;
  } catch {
    return new Response("Invalid JSON", { status: 400 });
  }

  const input = typeof body.input === "string" ? body.input.trim() : "";
  if (!input) return new Response("input required", { status: 400 });

  if (isRateLimited(socketId)) {
    log("warn", "http:rate-limited", { socketId });
    return new Response("Too Many Requests", { status: 429 });
  }

  sessions.touch(socketId);
  const session = sessions.get(socketId);
  const ctx: ICoreContext = {
    socketId,
    sessionId: session?.sessionId ?? null,
    input,
    args: [],
    send: (msg: string) => {
      const ctrl = _sseStreams.get(socketId);
      if (ctrl) {
        try { ctrl.enqueue(sseEvent(msg)); } catch { /* stream closed */ }
      }
    },
  };

  try {
    await runPipeline(ctx);
  } catch (e: unknown) {
    log("error", "http:pipeline-error", { socketId, error: String(e) });
    return new Response("Internal error", { status: 500 });
  }

  return Response.json({ ok: true });
}

function sendSse(socketId: string, msg: string): void {
  const ctrl = _sseStreams.get(socketId);
  if (!ctrl) return;
  try {
    ctrl.enqueue(sseEvent(msg));
  } catch (e: unknown) {
    log("warn", "sse:send-failed", { socketId, error: String(e) });
    closeSse(socketId);
  }
}

function addSecurityHeaders(res: Response): Response {
  const h = new Headers(res.headers);
  h.set("x-content-type-options", "nosniff");
  h.set("x-frame-options", "DENY");
  h.set("content-security-policy", "default-src 'none'");
  h.set("referrer-policy", "no-referrer");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

async function requestHandler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const pathname = url.pathname;
  const method = req.method.toUpperCase();

  if (method === "GET" && pathname === "/health") return handleHealth();

  if (method === "GET" && pathname === "/events") {
    // Opt-in auth guard: when requireAuthForSSE is enabled, demand a Bearer token.
    if (getConfig<boolean>("server.requireAuthForSSE", false)) {
      const authHeader = req.headers.get("authorization") ?? "";
      if (!authHeader.startsWith("Bearer ") || authHeader.length < 8) {
        return new Response("Unauthorized", { status: 401 });
      }
    }
    // Always generate the socketId server-side — never trust the client's value.
    // The assigned ID is returned in X-Socket-Id so the client can use it for POST /input.
    const socketId = crypto.randomUUID();
    return handleSse(socketId);
  }

  if (method === "POST" && pathname === "/input") return handleInput(req);

  const match = matchRoute(method, pathname);
  if (match) {
    try {
      return await match.entry.handler(req, match.params);
    } catch (e: unknown) {
      log("error", "http:route-error", { pathname, error: String(e) });
      return new Response("Internal error", { status: 500 });
    }
  }

  // Delegate to the application fallback (e.g. the full REST API router).
  if (_fallback) return _fallback(req);

  return new Response("Not found", { status: 404 });
}

async function secureRequestHandler(req: Request): Promise<Response> {
  const res = await requestHandler(req);
  // SSE streams must not be rewrapped (body is a ReadableStream).
  if (res.headers.get("content-type")?.startsWith("text/event-stream")) return res;
  return addSecurityHeaders(res);
}

// Exported for unit testing only — uses the secured wrapper.
export { secureRequestHandler as requestHandler };

let _server: Deno.HttpServer | null = null;

export const httpTransport: ITransport = {
  name: "http",

  async start(): Promise<void> {
    const port = getConfig<number>("server.port", 4201);
    _server = Deno.serve({ port }, secureRequestHandler);
    // Register SSE sender so broadcast/send.ts can reach SSE streams
    const { registerSender } = await import("../broadcast/send.ts");
    registerSender(sendSse);
    log("info", "http:start", { port });
  },

  async stop(): Promise<void> {
    for (const [socketId] of _sseStreams) {
      closeSse(socketId);
    }
    if (_server) {
      await _server.shutdown();
      _server = null;
    }
    log("info", "http:stop", {});
  },
};
