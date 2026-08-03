/**
 * @module routes/index
 *
 * Barrel file for all @ursamu/mush REST route handlers.
 *
 * Also exports `registerMushRoutes` which wires every handler into
 * @ursamu/core's HTTP transport via registerRoute / registerFallback.
 *
 * Usage in a game's main.ts:
 * ```ts
 * import { registerMushRoutes } from "@ursamu/mush/routes";
 * import { verifyToken } from "@ursamu/core";
 *
 * registerMushRoutes(async (req) => {
 *   const auth = req.headers.get("authorization") ?? "";
 *   const token = auth.replace(/^Bearer\s+/i, "");
 *   if (!token) return null;
 *   try { const payload = await verifyToken(token); return payload.id as string; }
 *   catch { return null; }
 * });
 * ```
 */

export { authHandler, MAX_TRACKED_IPS }    from "./auth.ts";
export { configHandler }                   from "./config.ts";
export { dbObjHandler }                    from "./dbobj.ts";
export { meHandler, onlinePlayersHandler, channelsHandler, channelHistoryHandler } from "./players.ts";
export { sceneHandler }                    from "./scenes.ts";
export { objectsHandler, flagsHandler, functionsHandler } from "./objects.ts";
export { authenticate } from "./authMiddleware.ts";

import { registerRoute, registerFallback } from "@ursamu/core";
import {
  dispatchPluginRoute,
  hasPluginPrefix,
} from "./plugin.ts";
import { authHandler }    from "./auth.ts";
import { configHandler }  from "./config.ts";
import { dbObjHandler }   from "./dbobj.ts";
import { sceneHandler }   from "./scenes.ts";
import { objectsHandler, flagsHandler, functionsHandler } from "./objects.ts";
import {
  meHandler,
  onlinePlayersHandler,
  channelsHandler,
  channelHistoryHandler,
} from "./players.ts";

type Authenticator = (req: Request) => Promise<string | null>;

// ── route registration ────────────────────────────────────────────────────────

export function registerMushRoutes(authenticate: Authenticator): void {
  // Public config / text routes (no auth required)
  for (const suffix of ["config", "connect", "welcome", "404"]) {
    registerRoute("GET", `/api/v1/${suffix}`, (req) => configHandler(req));
  }

  // Auth routes (no JWT required — they produce JWT).
  // remoteAddr is threaded from Deno.serve connInfo for per-IP rate limits.
  registerRoute("POST", "/api/v1/login", (req, _p, addr) =>
    authHandler(req, addr ?? "unknown"));
  registerRoute("POST", "/api/v1/register", (req, _p, addr) =>
    authHandler(req, addr ?? "unknown"));
  registerRoute("POST", "/api/v1/reset-password", (req, _p, addr) =>
    authHandler(req, addr ?? "unknown"));

  // Public catalog routes
  registerRoute("GET", "/api/v1/flags",     (req) => Promise.resolve(flagsHandler(req)));
  registerRoute("GET", "/api/v1/functions", (req) => functionsHandler(req));

  // Online players (no auth — public info)
  registerRoute("GET", "/api/v1/players/online", (req) => onlinePlayersHandler(req));

  // Channels (public list; history is auth-gated inside the handler)
  registerRoute("GET", "/api/v1/channels", (req) => channelsHandler(req));

  // The remaining routes all require authentication; use registerFallback to
  // catch any path not matched by the static routes above, authenticate, and
  // dispatch to the correct handler.
  registerFallback(async (req, remoteAddr) => {
    const url  = new URL(req.url);
    const path = url.pathname;

    // Auth endpoints that don't need a userId
    if (path === "/api/v1/login" || path === "/api/v1/register" || path === "/api/v1/reset-password") {
      return authHandler(req, remoteAddr);
    }

    // Channel history — auth required
    const chanHistMatch = path.match(/^\/api\/v1\/channels\/([^/]+)\/history$/);
    if (chanHistMatch) {
      const userId = await authenticate(req);
      if (!userId) return new Response("Unauthorized", { status: 401 });
      return channelHistoryHandler(req, chanHistMatch[1]);
    }

    // /api/v1/me
    if (path === "/api/v1/me") {
      const userId = await authenticate(req);
      if (!userId) return new Response("Unauthorized", { status: 401 });
      return meHandler(req, userId);
    }

    // /api/v1/dbos or /api/v1/dbobj/:id
    if (path === "/api/v1/dbos" || path.startsWith("/api/v1/dbobj/")) {
      const userId = await authenticate(req);
      if (!userId) return new Response("Unauthorized", { status: 401 });
      return dbObjHandler(req, userId);
    }

    // /api/v1/scenes/*
    if (path.startsWith("/api/v1/scenes")) {
      const userId = await authenticate(req);
      if (!userId) return new Response("Unauthorized", { status: 401 });
      return sceneHandler(req, userId);
    }

    // /api/v1/objects/*
    if (path.startsWith("/api/v1/objects")) {
      const userId = await authenticate(req);
      if (!userId) return new Response("Unauthorized", { status: 401 });
      return objectsHandler(req, userId);
    }

    // /avatars/:id — serve avatar images (public, no auth)
    if (path.startsWith("/avatars/")) {
      return avatarServe(path);
    }

    // Plugin routes (registered via registerPluginRoute)
    const pluginRes = await dispatchPluginRoute(req, authenticate);
    if (pluginRes) return pluginRes;

    return new Response("Not Found", { status: 404 });
  });
}

// ── Standalone request handler ───────────────────────────────────────────────
// Used by src/app.ts for test compatibility and as the registerFallback target.

const MAX_API_TRACKED_IPS = 5_000;
/** Max REST requests per IP per sliding window (handleRequest path). */
export const API_RATE_LIMIT = 120;
const API_RATE_WINDOW_MS = 60_000;
export { MAX_API_TRACKED_IPS };

const apiRateLimits = new Map<string, { count: number; resetAt: number }>();

export async function handleRequest(req: Request, remoteAddr = "unknown"): Promise<Response> {
  const url    = new URL(req.url);
  const path   = url.pathname;
  const method = req.method.toUpperCase();

  // Per-IP API rate limiting
  const now = Date.now();
  let entry = apiRateLimits.get(remoteAddr);
  if (!entry || now >= entry.resetAt) {
    if (apiRateLimits.size >= MAX_API_TRACKED_IPS) {
      const oldest = apiRateLimits.keys().next().value;
      if (oldest) apiRateLimits.delete(oldest);
    }
    entry = { count: 1, resetAt: now + API_RATE_WINDOW_MS };
    apiRateLimits.set(remoteAddr, entry);
  } else {
    entry.count++;
  }
  if (entry.count > API_RATE_LIMIT) {
    const retryAfter = Math.max(
      1,
      Math.ceil((entry.resetAt - now) / 1000),
    ).toString();
    return new Response(
      JSON.stringify({ error: "Too many requests. Try again later." }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": retryAfter,
        },
      },
    );
  }

  // Health stays JSON. Bare "/" — prefer public FE (plugins.site
  // serveRoot) when registered; else browsers → /admin/.
  if (path === "/health") {
    return Response.json({ status: "ok", engine: "UrsaMU" });
  }
  if (path === "/" && (method === "GET" || method === "HEAD")) {
    const pluginHome = await dispatchPluginRoute(
      req,
      _authenticate,
    );
    if (pluginHome && pluginHome.status !== 404) {
      return pluginHome;
    }
    const accept = (req.headers.get("accept") ?? "").toLowerCase();
    const wantsHtml = accept.includes("text/html");
    if (wantsHtml) {
      // Public FE over staff console when @ursamu/site is loaded
      const siteHome = hasPluginPrefix("/site") ||
        hasPluginPrefix("/");
      return new Response(null, {
        status: 302,
        headers: {
          Location: siteHome ? "/site/" : "/admin/",
        },
      });
    }
    return Response.json({
      status: "ok",
      engine: "UrsaMU",
      admin: "/admin/",
      site: "/site/",
    });
  }

  // Auth — login / register / reset (and legacy /api/v1/auth/*)
  if (
    path === "/api/v1/login" ||
    path === "/api/v1/register" ||
    path === "/api/v1/reset-password" ||
    path === "/api/v1/auth" ||
    path.startsWith("/api/v1/auth/")
  ) {
    return authHandler(req, remoteAddr);
  }

  if (path === "/api/v1/me" && method === "GET") {
    const userId = await _authenticate(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return meHandler(req, userId);
  }

  if (path === "/api/v1/players/online" && method === "GET") {
    const userId = await _authenticate(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return onlinePlayersHandler(req);
  }

  if (path === "/api/v1/channels" && method === "GET") return channelsHandler(req);

  const chanHistMatch = path.match(/^\/api\/v1\/channels\/([^/]+)\/history$/);
  if (chanHistMatch && method === "GET") {
    const userId = await _authenticate(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return channelHistoryHandler(req, chanHistMatch[1]);
  }

  if (path === "/api/v1/flags" && method === "GET")     return flagsHandler(req);
  if (path === "/api/v1/functions" && method === "GET") return functionsHandler(req);

  // /api/v1/dbos (list) and /api/v1/dbobj/:id (item)
  if (
    path === "/api/v1/dbos" ||
    path.startsWith("/api/v1/dbobj/") ||
    path === "/api/v1/dbobj"
  ) {
    const userId = await _authenticate(req);
    if (!userId) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        {
          status: 401,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    return dbObjHandler(req, userId);
  }

  if (path.startsWith("/api/v1/scenes")) {
    const userId = await _authenticate(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return sceneHandler(req, userId);
  }

  if (path.startsWith("/api/v1/objects")) {
    const userId = await _authenticate(req);
    if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
    return objectsHandler(req, userId);
  }

  if (path === "/api/v1/config" || path.startsWith("/api/v1/config/") ||
      path === "/api/v1/connect" || path.startsWith("/api/v1/connect/") ||
      path === "/api/v1/welcome") {
    return configHandler(req);
  }

  if (path.startsWith("/avatars/")) return avatarServe(path);

  // Plugin routes (registered via registerPluginRoute)
  const pluginRes = await dispatchPluginRoute(req, _authenticate);
  if (pluginRes) return pluginRes;

  return new Response("Not found", { status: 404 });
}

// Lazy-loaded authenticator (avoids circular import with src/app.ts)
let _authenticate: (req: Request) => Promise<string | null> = () => Promise.resolve(null);
export function setAuthenticator(fn: (req: Request) => Promise<string | null>): void {
  _authenticate = fn;
}

// ── Avatar file server ────────────────────────────────────────────────────────

const EXT_MIME: Record<string, string> = {
  png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
};

/**
 * Public: serve avatar by id or id.ext
 *   /avatars/2       → data/avatars/2.*
 *   /avatars/2.jpg   → data/avatars/2.jpg (exact)
 * Discord webhooks need a path ending in an image extension.
 */
export async function avatarServe(urlPath: string): Promise<Response> {
  const raw = urlPath.slice("/avatars/".length).split("?")[0];
  // id or id.ext — no path traversal
  if (!raw || !/^[a-zA-Z0-9_-]+(\.(png|jpe?g|gif|webp))?$/i.test(raw)) {
    return new Response("Not Found", { status: 404 });
  }
  const wantExact = raw.includes(".");
  const id = wantExact ? raw.replace(/\.[^.]+$/, "") : raw;
  try {
    for await (const entry of Deno.readDir("data/avatars")) {
      const hit = wantExact
        ? entry.name.toLowerCase() === raw.toLowerCase()
        : entry.name.startsWith(id + ".");
      if (!hit) continue;
      const ext = (entry.name.split(".").pop() ?? "").toLowerCase();
      const file = await Deno.readFile(`data/avatars/${entry.name}`);
      return new Response(file, {
        status: 200,
        headers: {
          "Content-Type": EXT_MIME[ext] ?? "application/octet-stream",
          // Short cache — Discord rejects ?query cache-busters on
          // avatar_url, so replacements rely on re-fetch.
          "Cache-Control": "public, max-age=300",
          "ngrok-skip-browser-warning": "true",
          "bypass-tunnel-reminder": "true",
        },
      });
    }
  } catch { /* data/avatars doesn't exist yet */ }
  return new Response("Not Found", { status: 404 });
}
