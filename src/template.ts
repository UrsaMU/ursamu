/**
 * UrSamu Game Template
 * 
 * This file serves as a template for creating your own UrSamu-based game.
 * Copy this file to your project and modify it to suit your needs.
 */

import { mu, IConfig } from "./index.ts";
import { dpath } from "../deps.ts";

// Define your custom configuration
const config: IConfig = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "data/counters.db",
    chans: "data/chans.db",
    mail: "data/mail.db",
    bboard: "data/bboard.db",
  },
  game: {
    name: "UrsaMU",
    description: "A custom UrsaMU game",
    version: "0.0.1",
    text: {
      connect: "text/default_connect.txt",
    },
    playerStart: "1",
  },
  // Add any custom plugins here
  plugins: {
    // Example:
    // "my-plugin": {
    //   enabled: true,
    //   options: {}
    // }
  },
};

export default config;

// Default way to start the server
if (import.meta.main) {
  const { logError } = await import("./utils/logger.ts");

  // Global Error Handlers
  globalThis.addEventListener("unhandledrejection", (e) => {
    e.preventDefault();
    logError(e.reason, "Unhandled Rejection");
  });

  globalThis.addEventListener("error", (e) => {
    e.preventDefault();
    logError(e.error, "Uncaught Exception");
  });

  try {
    const game = await mu(config);
    console.log(`${game.config.get("game.name")} main server is running!`);

    // Example of loading plugins from a directory
    const _pluginsDir = dpath.join(dpath.dirname(dpath.fromFileUrl(import.meta.url)), "plugins");
    // await game.plugins.load(_pluginsDir);

  } catch (error) {
    await logError(error, "Fatal Initialization Error");
    Deno.exit(1);
  }
}