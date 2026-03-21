
import { txtFiles } from "../services/commands/index.ts";

export const wikiHandler = (req: Request): Response => {
  const url = new URL(req.url);
  
  // List all topics
  if (url.pathname === "/api/v1/wiki" || url.pathname === "/api/v1/wiki/") {
      const files = Array.from(txtFiles.keys());
      return new Response(JSON.stringify(files), {
          status: 200,
          headers: { "Content-Type": "application/json" }
      });
  }

  // Get specific topic
  const match = url.pathname.match(/\/api\/v1\/wiki\/(.+)/);
  if (match) {
      const topic = match[1];
      const decoded = decodeURIComponent(topic);

      // Block path traversal attempts (../, ..\, null bytes, absolute paths)
      if (
        decoded.includes("..") ||
        decoded.includes("\0") ||
        decoded.startsWith("/") ||
        decoded.startsWith("\\")
      ) {
        return new Response(JSON.stringify({ error: "Invalid topic path" }), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const content = txtFiles.get(decoded);
      
      if (!content) {
          return new Response(JSON.stringify({ error: "Topic not found" }), {
              status: 404,
              headers: { "Content-Type": "application/json" }
          });
      }

      return new Response(JSON.stringify({ topic: decoded, content }), {
          status: 200,
          headers: { "Content-Type": "application/json" }
      });
  }

  return new Response("Not Found", { status: 404 });
};
