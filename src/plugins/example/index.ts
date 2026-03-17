import type { IPlugin } from "../../@types/IPlugin.ts";
import { registerPluginRoute } from "../../app.ts";
import { exampleRouteHandler } from "./router.ts";
// Import commands to register them at init time
import "./commands.ts";

// ─── plugin definition ────────────────────────────────────────────────────────
//
// This is the starter template for an UrsaMU plugin. Copy this folder to
// src/plugins/<your-plugin-name>/ and rename things as needed.
//
// A plugin can provide any combination of:
//   • In-game commands  (commands.ts  — uses addCmd)
//   • REST API routes   (router.ts    — uses registerPluginRoute)
//   • A private database(db.ts        — uses DBO)
//   • Config defaults   (plugin.config below)
//
// The plugin is auto-discovered by the engine: any folder under src/plugins/
// with an index.ts that exports a default IPlugin object will be loaded.

const examplePlugin: IPlugin = {
  name: "example",
  version: "1.0.0",
  description: "Starter template — demonstrates commands, REST routes, and a custom database",

  // Optional: default config values merged into the global config on load.
  // Access them anywhere with getConfig("plugins.example.someKey").
  config: {
    plugins: {
      example: {
        enabled: true,
      },
    },
  },

  init: async () => {
    // Register all HTTP routes handled by this plugin.
    // The prefix must match the paths used in your route handler.
    registerPluginRoute("/api/v1/example", exampleRouteHandler);
    console.log("[example] Plugin initialized");
    return true;
  },

  remove: async () => {
    console.log("[example] Plugin removed");
  },
};

export default examplePlugin;
