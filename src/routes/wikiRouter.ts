
import { txtFiles } from "../services/commands/index.ts";

export const wikiHandler = async (req: Request): Promise<Response> => {
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
      const topic = match[1]; // Should be filename like 'connect.txt' or 'help/connect.txt'
      // Need to handle URL decoding
      const decoded = decodeURIComponent(topic);
      
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
