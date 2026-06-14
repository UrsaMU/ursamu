/**
 * UrSamu Game Template
 * 
 * This file serves as a template for creating your own UrSamu-based game.
 * Copy this file to your project and modify it to suit your needs.
 */

import { mu, type IConfig } from "../mod.ts";


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
  plugins: {
  },
};

export default config;

if (import.meta.main) {
  const { log } = await import("@ursamu/core");
  const logError = async (error: unknown, context = "Error"): Promise<void> => {
    await Promise.resolve();
    const msg = error instanceof Error ? error.message : String(error);
    log("error", context, { message: msg });
  };

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
  } catch (error) {
    await logError(error, "Fatal Initialization Error");
    Deno.exit(1);
  }
}
