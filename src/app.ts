/**
 * @module app
 * @description The UrsaMU HTTP application layer.
 *
 * Exports the plugin route registration API (`registerPluginRoute`), the
 * main HTTP request dispatcher (`handleRequest`), and re-exports the
 * command registration helper (`addCmd`) for convenience.
 *
 * @example
 * ```ts
 * import { registerPluginRoute, addCmd } from "@ursamu/ursamu/app";
 *
 * // Mount a custom REST endpoint
 * registerPluginRoute("/api/v1/my-plugin", myHandler);
 *
 * // Register an in-game command
 * addCmd({ name: "greet", pattern: /^greet$/i, exec: (u) => u.emit("Hello!") });
 * ```
 */

import { authHandler, dbObjHandler, wikiHandler, configHandler, sceneHandler, buildingHandler, mailHandler } from "./routes/index.ts";
import { meHandler, onlinePlayersHandler, channelsHandler } from "./routes/playersRouter.ts";
import { authenticate } from "./middleware/authMiddleware.ts";
import { getConfig } from "./services/Config/mod.ts";

export { addCmd } from "./services/commands/cmdParser.ts";
export type { ICmd } from "./@types/ICmd.ts";

type PluginRouteHandler = (req: Request, userId: string | null) => Promise<Response>;
const pluginRoutes: Array<{ prefix: string; handler: PluginRouteHandler }> = [];

// --- Per-IP rate limiting for REST API ---
const apiRateLimits = new Map<string, { count: number; resetAt: number }>();
const API_RATE_LIMIT = 30;      // max requests per window
const API_RATE_WINDOW_MS = 10000; // 10 second window

function isApiRateLimited(ip: string): boolean {
  const now = Date.now();
  const entry = apiRateLimits.get(ip);
  if (!entry || now >= entry.resetAt) {
    apiRateLimits.set(ip, { count: 1, resetAt: now + API_RATE_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > API_RATE_LIMIT;
}

// Clean up stale entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of apiRateLimits) {
    if (now >= entry.resetAt) apiRateLimits.delete(ip);
  }
}, 60000);

/**
 * Register a custom HTTP route prefix and handler for use by plugins.
 *
 * The handler receives every request whose path starts with `prefix` and must
 * return a `Response`. `userId` is `null` when the request is unauthenticated.
 *
 * @param prefix - URL path prefix, e.g. `"/api/v1/my-plugin"`.
 * @param handler - Async function `(req, userId) => Response`.
 */
export function registerPluginRoute(prefix: string, handler: PluginRouteHandler): void {
  pluginRoutes.push({ prefix, handler });
}

/**
 * Main HTTP request dispatcher for the UrsaMU server.
 *
 * Routes incoming requests to the appropriate sub-handler (auth, objects,
 * wiki, scenes, channels, players, config, building, or plugin routes).
 * Applies CORS headers and per-IP rate limiting on every request.
 */
export const handleRequest = async (req: Request, remoteAddr = "unknown"): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS Headers — configurable via server.corsOrigins (no default; omitting the header
  // enforces same-origin policy). Set to an explicit origin or list in production.
  const configured = getConfig<string | string[]>("server.corsOrigins");
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin: string | null = null;
  if (configured === "*") {
    allowOrigin = "*";
  } else if (configured) {
    const allowed = Array.isArray(configured) ? configured : [configured];
    if (allowed.includes(origin)) allowOrigin = origin;
  }
  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "Content-Security-Policy": "default-src 'self'",
    "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
  };
  if (allowOrigin) corsHeaders["Access-Control-Allow-Origin"] = allowOrigin;

  // Rate limit check — only trust x-forwarded-for when server.trustedProxy is enabled.
  // Without a trusted proxy the Fetch API Request has no socket-level IP; per-IP rate
  // limiting is disabled in that mode (all requests share "unknown").
  const trustedProxy = getConfig<boolean>("server.trustedProxy") ?? false;
  const clientIp = trustedProxy
    ? (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown"
    : remoteAddr;
  if (isApiRateLimited(clientIp)) {
    return new Response(JSON.stringify({ error: "Too many requests" }), {
      status: 429,
      headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": "10" },
    });
  }

  // Handle Preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  const response = await (async () => {
    // API Routes
    if (path.startsWith("/api/v1/auth")) {
      return await authHandler(req, remoteAddr);
    }

    if (path === "/api/v1/me" && req.method === "GET") {
      const userId = await authenticate(req);
      if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      return await meHandler(req, userId);
    }

    if (path === "/api/v1/players/online" && req.method === "GET") {
      const userId = await authenticate(req);
      if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      return await onlinePlayersHandler(req);
    }

    if (path === "/api/v1/channels" && req.method === "GET") {
      return await channelsHandler(req);
    }

    if (path.startsWith("/api/v1/dbobj")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return await dbObjHandler(req, userId);
    }

    if (path.startsWith("/api/v1/wiki")) {
      return await wikiHandler(req);
    }

    if (path.startsWith("/api/v1/scenes")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return await sceneHandler(req, userId);
    }
    
    if (path.startsWith("/api/v1/building")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return await buildingHandler(req, userId);
    }

    if (path.startsWith("/api/v1/mail")) {
      const userId = await authenticate(req);
      if (!userId) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      }
      return await mailHandler(req, userId);
    }

    if (path.startsWith("/api/v1/config") || path.startsWith("/api/v1/connect") || path.startsWith("/api/v1/welcome")) {
        return await configHandler(req);
    }

    // Avatar images — public, no auth required
    if (path.startsWith("/avatars/")) {
      const id = path.slice("/avatars/".length);
      // Only allow safe characters: alphanumeric, hyphen, underscore (no dots, slashes, or escapes)
      if (!id || !/^[a-zA-Z0-9_-]+$/.test(id)) {
        return new Response("Not Found", { status: 404 });
      }
      const EXT_MIME: Record<string, string> = {
        png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
      };
      try {
        for await (const entry of Deno.readDir("data/avatars")) {
          if (entry.name.startsWith(id + ".")) {
            const ext = entry.name.split(".").pop() ?? "";
            const file = await Deno.readFile(`data/avatars/${entry.name}`);
            return new Response(file, {
              status: 200,
              headers: {
                "Content-Type": EXT_MIME[ext] ?? "application/octet-stream",
                "Cache-Control": "public, max-age=3600",
              },
            });
          }
        }
      } catch {
        // data/avatars doesn't exist yet
      }
      return new Response("Not Found", { status: 404 });
    }

    // Health check or root
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ status: "ok", engine: "UrsaMU" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Plugin routes
    for (const { prefix, handler } of pluginRoutes) {
      if (path.startsWith(prefix)) {
        const userId = await authenticate(req).catch(() => null);
        const pluginResponse = await handler(req, userId);
        for (const [key, value] of Object.entries(corsHeaders)) {
          pluginResponse.headers.set(key, value);
        }
        return pluginResponse;
      }
    }

    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: { "Content-Type": "application/json" },
    });
  })();

  // Attach CORS to response
  for (const [key, value] of Object.entries(corsHeaders)) {
    response.headers.set(key, value);
  }

  return response;
};
