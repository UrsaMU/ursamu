import { authHandler, dbObjHandler, wikiHandler, configHandler, sceneHandler, buildingHandler } from "./routes/index.ts";
import { meHandler, onlinePlayersHandler, channelsHandler } from "./routes/playersRouter.ts";
import { authenticate } from "./middleware/authMiddleware.ts";
import { getConfig } from "./services/Config/mod.ts";

type PluginRouteHandler = (req: Request, userId: string | null) => Promise<Response>;
const pluginRoutes: Array<{ prefix: string; handler: PluginRouteHandler }> = [];

export function registerPluginRoute(prefix: string, handler: PluginRouteHandler): void {
  pluginRoutes.push({ prefix, handler });
}

/**
 * Handle HTTP requests for the UrsaMU server
 * This replaces the Express application and provides native Deno handling for API routes
 */
export const handleRequest = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS Headers — configurable via server.corsOrigins (default: "*")
  const configured = getConfig<string | string[]>("server.corsOrigins") ?? "*";
  const origin = req.headers.get("Origin") ?? "";
  let allowOrigin = "*";
  if (configured !== "*") {
    const allowed = Array.isArray(configured) ? configured : [configured];
    allowOrigin = allowed.includes(origin) ? origin : allowed[0];
  }
  const corsHeaders = {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };

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
      return await authHandler(req);
    }

    if (path === "/api/v1/me" && req.method === "GET") {
      const userId = await authenticate(req);
      if (!userId) return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      return await meHandler(req, userId);
    }

    if (path === "/api/v1/players/online" && req.method === "GET") {
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

    if (path.startsWith("/api/v1/config") || path.startsWith("/api/v1/connect") || path.startsWith("/api/v1/welcome")) {
        return await configHandler(req);
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
