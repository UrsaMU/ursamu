import { ConfigManager } from "../services/Config/index.ts";
import { texts } from "../services/Database/index.ts";


export const configHandler = async (req: Request) => {
  const url = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/config")) {
    const config = ConfigManager.getInstance().getAll() as any;
    
    // Return safe subset of config
    const safeConfig = {
      game: {
        name: config.game?.name || "UrsaMU",
        description: config.game?.description || "",
        version: config.game?.version || "0.0.1",
      },
      server: {
        ws: config.server?.ws || 4202,
        telnet: config.server?.telnet || 4201,
        http: config.server?.http || 4203,
      },
      theme: config.theme || {
         primary: "#f97316",
         secondary: "#27272a",
         accent: "#fb923c",
         background: "#000000",
         surface: "#09090b",
         text: "#fafafa",
         muted: "#a1a1aa",
         glass: "rgba(9, 9, 11, 0.7)",
         glassBorder: "rgba(255, 255, 255, 0.05)",
         backgroundImage: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=2938&ixlib=rb-4.0.3",
      }
    };

    return new Response(JSON.stringify(safeConfig), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.endsWith("/connect")) {
     try {
        const config = ConfigManager.getInstance().getAll() as any;
        const connectFile = config.game?.text?.connect || "../text/default_connect.txt";
        
        // Resolve path relative to CWD (project root)
        const filePath = connectFile; 
        
        const text = await Deno.readTextFile(filePath);
        return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" },
        });
     } catch (e) {
         console.error("Error reading connect text:", e);
         return new Response(JSON.stringify({ error: "Could not read connect text." }), {
             status: 500,
             headers: { "Content-Type": "application/json" },
         });
     }
  }

  if (path.endsWith("/welcome")) {
     try {
        const entry = await texts.queryOne({ id: "welcome" });
        const text = entry ? entry.content : "# Welcome to UrsaMU\n\nYour journey begins here.";
        
        return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" },
        });
     } catch (e) {
         console.error("Error reading welcome text:", e);
         return new Response(JSON.stringify({ error: "Could not read welcome text." }), {
             status: 500,
             headers: { "Content-Type": "application/json" },
         });
     }
  }

  if (path.endsWith("/404")) {
     try {
        const entry = await texts.queryOne({ id: "404" });
        // Default 404 content if not in DB
        const default404 = `
# 404
## Signal Lost

We've scanned the sector, but the coordinates you provided lead to deep space.

<Button href="/" variant="primary">Return to Base</Button>
`;
        const text = entry ? entry.content : default404;
        
        return new Response(JSON.stringify({ text }), {
            headers: { "Content-Type": "application/json" },
        });
     } catch (e) {
         console.error("Error reading 404 text:", e);
         return new Response(JSON.stringify({ error: "Could not read 404 text." }), {
             status: 500,
             headers: { "Content-Type": "application/json" },
         });
     }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
};
