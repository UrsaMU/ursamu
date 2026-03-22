/**
 * @module web-client
 * @description Default web client plugin for UrsaMU.
 *
 * Serves a slot-based HTML client at `/client` and registers three core
 * UI components (output pane, input bar, who list) via `registerUIComponent`.
 *
 * Admins customize appearance by editing `static/style.css` — no build step
 * required. Advanced customization (layout changes) only requires editing
 * `static/index.html` and `static/client.js`.
 *
 * @note This plugin is intended for extraction to a standalone repo
 *       (`@ursamu/web-client-plugin`). When extracted, replace internal
 *       imports with `jsr:@ursamu/ursamu`.
 */

import { registerPluginRoute, registerUIComponent, unregisterUIComponent } from "../../app.ts";
import type { IPlugin } from "../../@types/IPlugin.ts";
import type { IUIComponent } from "../../@types/IUIComponent.ts";

const STATIC_ROOT = new URL("./static/", import.meta.url);

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "text/javascript; charset=utf-8",
  ".json": "application/json",
  ".ico":  "image/x-icon",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
};

function getMime(href: string): string {
  const dot = href.lastIndexOf(".");
  return dot !== -1 ? (MIME[href.slice(dot)] ?? "application/octet-stream") : "application/octet-stream";
}

/**
 * Resolve a request path to a file URL under STATIC_ROOT.
 * Returns null if the resolved path escapes STATIC_ROOT (path traversal guard).
 */
function resolveStaticPath(reqPath: string): URL | null {
  const stripped  = reqPath.slice("/client".length) || "/";
  const relative  = stripped.startsWith("/") ? stripped.slice(1) : stripped;
  const target    = relative || "index.html";
  const resolved  = new URL(target, STATIC_ROOT);
  if (!resolved.href.startsWith(STATIC_ROOT.href)) return null;
  return resolved;
}

/**
 * Serve static files from the `static/` directory.
 * Handles GET /client and GET /client/* — all other methods return 405.
 */
async function staticHandler(req: Request, _userId: string | null): Promise<Response> {
  if (req.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url      = new URL(req.url);
  const fileUrl  = resolveStaticPath(url.pathname);

  if (!fileUrl) return new Response("Not Found", { status: 404 });

  try {
    const file = await Deno.readFile(fileUrl);
    return new Response(file, {
      headers: {
        "Content-Type":  getMime(fileUrl.href),
        "Cache-Control": "public, max-age=60",
      },
    });
  } catch {
    return new Response("Not Found", { status: 404 });
  }
}

const CORE_COMPONENTS: IUIComponent[] = [
  {
    element: "ursamu-output",
    slot:    "client.output",
    script:  "/client/components/ursamu-output.js",
    lock:    "connected",
    label:   "Output Pane",
    order:   0,
    plugin:  "web-client",
  },
  {
    element: "ursamu-input",
    slot:    "client.input",
    script:  "/client/components/ursamu-input.js",
    lock:    "connected",
    label:   "Input Bar",
    order:   0,
    plugin:  "web-client",
  },
  {
    element: "ursamu-who",
    slot:    "client.sidebar",
    script:  "/client/components/ursamu-who.js",
    lock:    "connected",
    label:   "Who List",
    order:   10,
    plugin:  "web-client",
  },
  {
    element: "ursamu-status",
    slot:    "client.status-bar",
    script:  "/client/components/ursamu-status.js",
    lock:    "connected",
    label:   "Status Bar",
    order:   0,
    plugin:  "web-client",
  },
];

const plugin: IPlugin = {
  name:        "web-client",
  version:     "1.0.0",
  description: "Default web client — slot-based layout, CSS custom property theming, no build step.",

  init: () => {
    registerPluginRoute("/client", staticHandler);
    for (const c of CORE_COMPONENTS) registerUIComponent(c);
    console.log("[web-client] Initialized — client available at /client");
    return true;
  },

  remove: () => {
    for (const c of CORE_COMPONENTS) unregisterUIComponent(c.element);
    console.log("[web-client] Removed");
  },
};

export default plugin;
