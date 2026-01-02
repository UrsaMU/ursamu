import { authHandler, dbObjHandler, wikiHandler } from "./routes/index.ts";
import { authenticate } from "./middleware/authMiddleware.ts";

/**
 * Handle HTTP requests for the UrsaMU server
 * This replaces the Express application and provides native Deno handling for API routes
 */
export const handleRequest = async (req: Request): Promise<Response> => {
  const url = new URL(req.url);
  const path = url.pathname;

  // CORS Headers
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*", // Or specific origin if needed
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

    // Health check or root
    if (path === "/" || path === "/health") {
      return new Response(JSON.stringify({ status: "ok", engine: "UrsaMU" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
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
