/**
 * @module ursamu-core
 * @description The core engine initialization and management module.
 */
import "dotenv/load";
import { handleRequest } from "./app.ts";
import "./reboot.ts";
import { chans, counters, dbojs, texts } from "./world/dbobjs.ts";
import { runStartupAttrs } from "./world/startup.ts";
import { broadcastAll as broadcast, gameHooks } from "@ursamu/core";
import type { IPlugin } from "@ursamu/core";
import * as dpath from "@std/path";
import { initConfig, loadPlugins as initializePlugins, getConfig, setConfig, registerPlugin } from "@ursamu/core";
import { plugins, loadTxtDir, setFlags, loadPlugins } from "./main_utils.ts";
import { queue } from "@ursamu/core";
import {
  createServer, websocketTransport, telnetTransport, httpTransport,
  registerFallback,
} from "@ursamu/core";

async function initializeDefaultTexts() {
  try {
      const fileContent = await Deno.readTextFile("text/welcome.md");
      const current = await texts.queryOne({ id: "welcome" });

      if (!current || current.content !== fileContent) {
          if (current) {
              await texts.modify({ id: "welcome" }, "$set", { content: fileContent });
              console.log("Welcome text updated from file.");
          } else {
              await texts.create({
                  id: "welcome",
                  content: fileContent
              });
              console.log("Welcome text seeded from file.");
          }
      }
  } catch (_e) {
      const welcome = await texts.queryOne({ id: "welcome" });
      if (!welcome) {
         console.log("No welcome text found in file or DB. Creating default.");
          await texts.create({
              id: "welcome",
              content: "# Welcome to UrsaMU\n\nYour journey begins here."
          });
      }
  }
}

/**
 * Initialize and start the UrsaMU engine.
 */
export const initializeEngine = async (
  cfg?: Record<string, unknown>,
  customPlugins?: IPlugin[],
  options: {
    loadDefaultCommands?: boolean;
    loadDefaultTextFiles?: boolean;
    autoCreateDefaultRooms?: boolean;
    autoCreateDefaultChannels?: boolean;
    customCommandsPath?: string;
    customTextPath?: string;
    pluginsDir?: string;
  } = {},
  // deno-lint-ignore no-explicit-any
): Promise<any> => {
  const {
    loadDefaultCommands = true,
    loadDefaultTextFiles = true,
    autoCreateDefaultRooms = true,
    autoCreateDefaultChannels = true,
    customCommandsPath,
    customTextPath,
    pluginsDir: pluginsDirOverride,
  } = options;

  await initConfig(cfg);

  const staleConnected = await dbojs.query({ flags: /connected/i });
  for (const player of staleConnected) {
    await setFlags(player, "!connected");
  }
  if (staleConnected.length > 0) {
    console.log(`[startup] Cleared stale 'connected' flag on ${staleConnected.length} player(s).`);
  }

  const substitutions = getConfig<Record<string, string>>("substitutions");
  if (substitutions) {
      const { updateParserSubs } = await import("./render/parser.ts");
      updateParserSubs(substitutions);
  }

  const isLocal = import.meta.url.startsWith("file://") &&
    !Deno.env.get("URSAMU_JSR_MODE");
  
  if (loadDefaultCommands) {
    const { loadDefaultCommands: mushLoad } = await import("./commands/addCmd.ts");
    await mushLoad();
  }

  if (customCommandsPath) {
    await plugins(customCommandsPath);
  }

  if (loadDefaultTextFiles) {
    const __dirname = import.meta.url.startsWith("file://")
      ? dpath.dirname(dpath.fromFileUrl(import.meta.url))
      : Deno.cwd();
    // If local source, text is in CWD/text or packages/mush/text. We fall back to CWD text
    const textDir = dpath.join(Deno.cwd(), "text");
    try {
      if (await Deno.stat(textDir).then(() => true).catch(() => false)) {
          await loadTxtDir(textDir);
      }
    } catch (e) {
      console.warn(`Could not load default text files from ${textDir}:`, e);
    }
  }

  if (customTextPath) {
    await loadTxtDir(customTextPath);
  }

  const pluginsDir = pluginsDirOverride ?? dpath.join(Deno.cwd(), "plugins");
  
  let loadedPlugins: IPlugin[] = [];
  try {
     if (await Deno.stat(pluginsDir).then(info => info.isDirectory).catch(() => false)) {
        loadedPlugins = await loadPlugins(pluginsDir);
     }
  } catch (e) {
    console.warn(`Could not load plugins from ${pluginsDir}:`, e);
  }

  try {
    const { setLoadedPlugins } = await import("./verbs/admin-reload.ts");
    setLoadedPlugins(loadedPlugins);
  } catch { /* reload command may not be loaded yet */ }

  if (customPlugins && customPlugins.length > 0) {
    console.log(`Loading ${customPlugins.length} custom plugins...`);
    for (const plugin of customPlugins) {
      loadedPlugins.push(plugin);
      registerPlugin(plugin);
    }
  }

  const wsPort   = getConfig<number>("server.http")    || getConfig<number>("server.wsPort")     || 4203;
  const httpPort = getConfig<number>("server.apiPort") || getConfig<number>("server.port")        || 4201;
  const tnPort   = getConfig<number>("server.telnet")  || getConfig<number>("server.telnetPort")  || 4202;

  setConfig("server.wsPort",      wsPort);
  setConfig("server.port",        httpPort);
  setConfig("server.telnetPort",  tnPort);

  registerFallback(handleRequest);

  // Seed world data BEFORE opening ports — prevents race where a player
  // connects and creates a character before the starting room exists.
  if (autoCreateDefaultRooms) await initializeDefaultRooms();
  if (autoCreateDefaultChannels) await initializeDefaultChannels();

  await initializePlugins();

  const server = createServer();
  server.addTransport(websocketTransport);
  server.addTransport(httpTransport);
  server.addTransport(telnetTransport);
  await server.start();

  await initializeDefaultTexts();

  console.log(`Server started — WS:${wsPort}  HTTP:${httpPort}  Telnet:${tnPort}`);
  
  queue.init();

  const { gameClock } = await import("./world/game-clock.ts");
  await gameClock.load();
  setInterval(() => gameClock.tick(60_000), 60_000);
  console.log(`[GameClock] Loaded. Current game time: ${gameClock.format()}`);

  const { runSoftcodeSimple } = await import("./softcode/engine.ts");
  // deno-lint-ignore no-explicit-any
  const forceCmd = async (ctx: any, cmd: string) => { ctx; cmd; };
  runStartupAttrs(forceCmd, (code, opts) => runSoftcodeSimple(code, { actorId: opts.actorId, executorId: opts.actorId }))
    .catch((err) => console.error("[startup] runStartupAttrs failed:", err))
    .then(() => gameHooks.emit("engine:ready"));

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    await broadcast("Server shutting down.");
    Deno.exit(0);
  });

  return {
    config: {
      get: getConfig,
      init: initConfig,
    },
    plugins: {
      initialize: initializePlugins,
      load: loadPlugins,
    },
    database: {
      dbojs,
      chans,
      counters,
      texts,
    },
    broadcast,
    setFlags,
  };
};

export const mu = initializeEngine;

async function initializeDefaultRooms() {
  const rooms = await dbojs.query({ flags: /room/i });

  if (!(await counters.query({ id: "objid" })).length) {
    await counters.create({ id: "objid", value: 0 });
  }

  if (!rooms.length) {
    const id = String(await counters.atomicIncrement("objid"));
    await dbojs.create({
      id,
      flags: "room safe void",
      data: {
        name: "The Void",
        description: "A featureless void, stretching endlessly in all directions."
      }
    });
    setConfig("game.playerStart", id);
    console.log(`[startup] Created starting room #${id}`);
  }
}

async function initializeDefaultChannels() {
  const channels = await chans.all();

  if (!channels.length) {
    await chans.create({
      id: "pub",
      name: "Public",
      header: "%ch%cc[Public]%cn",
      alias: "pub",
    });

    await chans.create({
      id: "admin",
      name: "Admin",
      header: "%ch%cy[Admin]%cn",
      alias: "ad",
      lock: "admin+",
    });
  }
}

const config = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    db: "data/ursamu.db",
    counters: "counters",
    chans: "chans",
    mail: "mail",
    bboard: "bboard"
  },
  game: {
    name: "UrsaMU",
    description: "A custom UrsaMU game",
    version: "0.0.1",
    text: {
      connect: "text/default_connect.txt"
    },
    playerStart: "1"
  }
};

if (import.meta.main) {
  const { log } = await import("@ursamu/core");
  const logError = async (error: unknown, context = "Error"): Promise<void> => {
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
    const game = await initializeEngine(config, undefined, { loadDefaultCommands: true });
    await checkAndCreateSuperuser();
    console.log(`${game.config.get("game.name")} main server is running!`);
  } catch (error) {
    await logError(error, "Fatal Initialization Error");
    Deno.exit(1);
  }
}

export async function checkAndCreateSuperuser() {
  const players = await dbojs.query({ flags: /player/i });

  if (players.length === 0) {
    console.log("\n┌─────────────────────────────────────────────────────┐");
    console.log("│  Fresh database detected — no players exist yet.    │");
    console.log("│                                                     │");
    console.log("│  Connect via telnet and run:                        │");
    console.log("│    create <name> <password>                         │");
    console.log("│                                                     │");
    console.log("│  The first player created is automatically given    │");
    console.log("│  superuser access.                                  │");
    console.log("└─────────────────────────────────────────────────────┘\n");
    return;
  }

  const superusers = await dbojs.query({ flags: /superuser/i });
  if (superusers.length === 0) {
    const sorted = players.slice().sort((a, b) => Number(a.id) - Number(b.id));
    const first = sorted[0];
    await setFlags(first, "superuser");
    const name = first.data?.name || first.id;
    console.log(`\n[Init] No superuser found — promoted '${name}' (#${first.id}) to superuser.\n`);
  }
}
