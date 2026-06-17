/**
 * @module routes/config
 *
 * Game configuration and text REST endpoints:
 *   GET /api/v1/config   — safe subset of game config
 *   GET /api/v1/connect  — connect screen text (from file)
 *   GET /api/v1/welcome  — welcome text (from DB)
 *   GET /api/v1/404      — 404 page content (from DB)
 */

import { resolve, join } from "@std/path";
import { getAllConfig }   from "@ursamu/core";
import { texts }         from "../world/dbobjs.ts";

export async function configHandler(req: Request): Promise<Response> {
  const url  = new URL(req.url);
  const path = url.pathname;

  if (path.endsWith("/config")) {
    // deno-lint-ignore no-explicit-any
    const config = getAllConfig() as any;
    const safeConfig = {
      game: {
        name:        config.game?.name        || "UrsaMU",
        description: config.game?.description || "",
        version:     config.game?.version     || "0.0.1",
      },
      server: {
        ws:     config.server?.ws     || 4202,
        telnet: config.server?.telnet || 4201,
        http:   config.server?.http   || 4203,
      },
      theme: config.theme || {
        primary:         "#f97316",
        secondary:       "#27272a",
        accent:          "#fb923c",
        background:      "#000000",
        surface:         "#09090b",
        text:            "#fafafa",
        muted:           "#a1a1aa",
        glass:           "rgba(9, 9, 11, 0.7)",
        glassBorder:     "rgba(255, 255, 255, 0.05)",
        backgroundImage: "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?auto=format&fit=crop&q=80&w=2938&ixlib=rb-4.0.3",
      },
    };
    return new Response(JSON.stringify(safeConfig), {
      headers: { "Content-Type": "application/json" },
    });
  }

  if (path.endsWith("/connect")) {
    try {
      // deno-lint-ignore no-explicit-any
      const config     = getAllConfig() as any;
      const connectFile: string = config.game?.text?.connect || "text/default_connect.txt";

      // Path traversal guard — verify the file stays inside ./text/
      const textRoot = resolve("./text");
      const filePath = resolve(join(".", connectFile));
      if (!filePath.startsWith(textRoot + "/") && filePath !== textRoot) {
        return new Response(JSON.stringify({ error: "Invalid connect text path." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }

      // Symlink guard — reject symlinks that could escape the text/ root.
      const stat = await Deno.lstat(filePath);
      if (stat.isSymlink) {
        return new Response(JSON.stringify({ error: "Invalid connect text path." }), {
          status: 400, headers: { "Content-Type": "application/json" },
        });
      }

      const text = await Deno.readTextFile(filePath);
      return new Response(JSON.stringify({ text }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Could not read connect text." }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (path.endsWith("/welcome")) {
    try {
      const entry = await texts.queryOne({ id: "welcome" });
      const text  = entry ? entry.content : "# Welcome to UrsaMU\n\nYour journey begins here.";
      return new Response(JSON.stringify({ text }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch {
      return new Response(JSON.stringify({ error: "Could not read welcome text." }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  if (path.endsWith("/404")) {
    try {
      const entry = await texts.queryOne({ id: "404" });
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
    } catch {
      return new Response(JSON.stringify({ error: "Could not read 404 text." }), {
        status: 500, headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response(JSON.stringify({ error: "Not Found" }), { status: 404 });
}
