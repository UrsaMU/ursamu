
/**
 * @module ursamu-core
 * @description The core engine initialization and management module.
 */
import "dotenv/load";
import { handleRequest } from "./app.ts";
import "./reboot.ts";
import { plugins, loadTxtDir, setFlags, loadPlugins, txtFiles } from "./main_utils.ts";
import {
  queue,
  initConfig,
  loadPlugins as initializePlugins,
  getConfig,
  registerPlugin,
  createServer,
  websocketTransport,
  telnetTransport,
  httpTransport,
  registerFallback,
  broadcastAll,
  gameHooks,
  log,
  runPipeline,
  send,
  setFormatter,
  sessions,
} from "@ursamu/core";
import type { IPlugin } from "@ursamu/core";
import * as dpath from "@std/path";
import { runStartupAttrs } from "./world/startup.ts";
import { runSoftcodeSimple } from "./softcode/engine.ts";
import { dbojs, chans, counters, texts } from "./world/dbobjs.ts";
import parser from "./render/parser.ts";

let __dirname;
try {
  if (import.meta.url.startsWith("file://")) {
    __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
  } else {
    __dirname = Deno.cwd();
  }
} catch {
  __dirname = Deno.cwd();
}

async function initializeDefaultTexts() {
  // Always try to read from file to keep DB in sync with local dev changes
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
     // File doesn't exist? Check if DB has it
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
 *
 * Loads configuration, seeds default rooms and channels, registers built-in
 * and custom plugins, and starts the HTTP and WebSocket servers.
 *
 * @param cfg - Optional configuration overrides (merged with defaults and `config.json`).
 * @param customPlugins - Additional plugins to load before the default plugin directory.
 * @param options - Fine-grained control over which defaults are loaded.
 * @returns References to the initialized services (db, broadcast, etc.).
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
  // Set default options
  const {
    loadDefaultCommands = true,
    loadDefaultTextFiles = true,
    autoCreateDefaultRooms = true,
    autoCreateDefaultChannels = true,
    customCommandsPath,
    customTextPath,
    pluginsDir: pluginsDirOverride,
  } = options;

  // Initialize the configuration system
  await initConfig(cfg);

  // Clear stale `connected` flags from the previous run. SIGINT clears them
  // cleanly, but crashes, kill -9, and SIGTERM (supervisor restart) do not —
  // sweeping at startup makes recovery robust regardless of shutdown path.
  // Players are re-flagged on WebSocket reconnect via JWT auto-reauth.
  const staleConnected = await dbojs.query({ flags: /connected/i });
  for (const player of staleConnected) {
    await setFlags(player, "!connected");
  }
  if (staleConnected.length > 0) {
    console.log(`[startup] Cleared stale 'connected' flag on ${staleConnected.length} player(s).`);
  }

  // Load substitutions from config
  const substitutions = getConfig<Record<string, string>>("substitutions");
  if (substitutions) {
      const { updateParserSubs } = await import("./render/parser.ts");
      updateParserSubs(substitutions);
  }

  // Determine the project root and current directory context
  const isLocal = import.meta.url.startsWith("file://") &&
    !Deno.env.get("URSAMU_JSR_MODE");
  
  // Load default commands if enabled
  if (loadDefaultCommands) {
    if (isLocal) {
      const { loadDefaultCommands: loadCmds } = await import("./commands/addCmd.ts");
      await loadCmds();
    } else {
      // On JSR, we import the build-time generated index (does not exist in source)
      // deno-lint-ignore no-explicit-any
      // @ts-ignore - commands/index.ts is generated at publish time for JSR only
      await import("./commands/index.ts");
    }
  }

  // Load custom commands if path provided
  if (customCommandsPath) {
    await plugins(customCommandsPath);
  }

  // Load default text files if enabled
  if (loadDefaultTextFiles) {
    const localTextDir = dpath.join(__dirname, "../text");
    const cwdTextDir = dpath.join(Deno.cwd(), "text");
    const textDir = (await Deno.stat(cwdTextDir).then(() => true).catch(() => false))
      ? cwdTextDir
      : (isLocal ? localTextDir : cwdTextDir);
    // Only try to load if directory exists to avoid crash
    try {
      if (await Deno.stat(textDir).then(() => true).catch(() => false)) {
          await loadTxtDir(textDir);
      }
    } catch (e) {
      console.warn(`Could not load default text files from ${textDir}:`, e);
    }
  }

  // Load custom text files if path provided
  if (customTextPath) {
    await loadTxtDir(customTextPath);
  }

  // Load plugins from the plugins directory
  // If local source, plugins is in ./plugins (relative to src)
  // If JSR, plugins is expected in ./src/plugins (relative to project root/CWD)
  const pluginsDir = pluginsDirOverride ?? (isLocal ? dpath.join(__dirname, "./plugins") : dpath.join(Deno.cwd(), "src", "plugins"));
  
  // Only try to load if directory exists
  let loadedPlugins: IPlugin[] = [];
  try {
     // Check if directory exists before loading
     if (await Deno.stat(pluginsDir).then(info => info.isDirectory).catch(() => false)) {
        loadedPlugins = await loadPlugins(pluginsDir);
     }
  } catch (e) {
    console.warn(`Could not load plugins from ${pluginsDir}:`, e);
  }

  // Share loaded plugins with @reload command for hot-reload
  try {
    const { setLoadedPlugins } = await import("./verbs/admin-reload.ts");
    setLoadedPlugins(loadedPlugins);
  } catch { /* reload command may not be loaded yet */ }

  // Add any custom plugins and register them so initializePlugins() will call init()
  if (customPlugins && customPlugins.length > 0) {
    console.log(`Loading ${customPlugins.length} custom plugins...`);
    for (const plugin of customPlugins) {
      loadedPlugins.push(plugin);
      registerPlugin(plugin);
    }
  }

  // Boot the server via @ursamu/core transports.
  // Align config keys: old engine used server.http for the combined WS+HTTP port.
  const wsPort   = getConfig<number>("server.http")    || getConfig<number>("server.wsPort")     || 4203;
  const httpPort = getConfig<number>("server.apiPort") || getConfig<number>("server.port")        || 4201;
  const tnPort   = getConfig<number>("server.telnet")  || getConfig<number>("server.telnetPort")  || 4202;

  // Patch config so the transport reads the right port values.
  const { setConfig } = await import("@ursamu/core");
  setConfig("server.wsPort",      wsPort);
  setConfig("server.port",        httpPort);
  setConfig("server.telnetPort",  tnPort);

  // Register app.ts handleRequest as the HTTP fallback for all REST routes.
  registerFallback(handleRequest);

  const server = createServer();
  server.addTransport(websocketTransport);
  server.addTransport(httpTransport);
  server.addTransport(telnetTransport);
  await server.start();

  // Initialize all registered plugins
  await initializePlugins();

  if (autoCreateDefaultRooms) {
    await initializeDefaultRooms();
  }

  if (autoCreateDefaultChannels) {
    await initializeDefaultChannels();
  }

  await initializeDefaultTexts();

  console.log(`Server started — WS:${wsPort}  HTTP:${httpPort}  Telnet:${tnPort}`);
  
  // Initialize Queue
  queue.init();

  // Configure outgoing message formatter
  setFormatter((socketId, msg) => {
    const session = sessions.get(socketId);
    const clientType = (session?.meta?.clientType as string) || "telnet";
    return parser.substitute(clientType === "web" ? "html" : "telnet", msg);
  });

  // Send welcome screen on new session
  gameHooks.on("session:open", async ({ socketId }) => {
    const session = sessions.get(socketId);
    if (session?.meta?.reconnect) return;

    let welcome = txtFiles.get("default_connect.txt");
    if (!welcome) {
      const entry = await texts.queryOne({ id: "welcome" });
      welcome = entry?.content || "Welcome to UrsaMU!";
    }
    // We can send raw message; it will be formatted by the setFormatter hook
    send([socketId], welcome);
  });

  // Handle session close (cleanup connected flag and run adisconnect)
  gameHooks.on("session:close", async ({ socketId, actorId }) => {
    console.log(`[session:close] Closed socketId: ${socketId}, actorId: ${actorId}`);
    if (actorId) {
      // Check if this player has other active sessions (multiple connections)
      const otherSessions = sessions.list().filter(
        (s) => s.socketId !== socketId && (s as any).actorId === actorId
      );

      console.log(`[session:close] Other sessions for actorId ${actorId}:`, otherSessions.length);
      if (otherSessions.length === 0) {
        const rawPlayer = await dbojs.queryOne({ id: actorId });
        if (rawPlayer) {
          console.log(`[session:close] Unsetting connected flag and running adisconnect for ${rawPlayer.data?.name || actorId}`);
          await setFlags(rawPlayer, "!connected");
          const { hooks: mushHooks } = await import("./events/hooks.ts");
          await mushHooks.adisconnect(rawPlayer, socketId);
        }
      }
    }
  });

  // Initialize in-game clock (load persisted time, then tick every real minute)
  const { gameClock } = await import("./world/game-clock.ts");
  await gameClock.load();
  setInterval(() => gameClock.tick(60_000), 60_000);
  console.log(`[GameClock] Loaded. Current game time: ${gameClock.format()}`);

  // Fire STARTUP attributes on all objects that have one (fire-and-forget)
  // engine:ready fires regardless of whether runStartupAttrs succeeds — it
  // signals "engine is up and all plugins are loaded", not "STARTUP attrs ran
  // cleanly".  Catching first converts any rejection into a resolution so the
  // chained .then() always executes.
  runStartupAttrs(
    async (ctx, cmd) => { await runPipeline({ ...ctx, raw: cmd, cmd: "" }); },
    (code, opts) => runSoftcodeSimple(code, { actorId: opts.actorId, executorId: opts.actorId }),
  )
    .catch((err) => console.error("[startup] runStartupAttrs failed:", err))
    .then(() => gameHooks.emit("engine:ready"));

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    broadcastAll("Server shutting down.");
    Deno.exit(0);
  });

  // Return an object with references to important components
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
    broadcast: broadcastAll,
    setFlags,
  };
};

/**
 * Alias for `initializeEngine` — the primary entry point for starting UrsaMU.
 *
 * @see {@link initializeEngine} for the full parameter list.
 */
export const mu = initializeEngine;

/**
 * Initialize default rooms if they don't exist
 */
async function initializeDefaultRooms() {
  const rooms = await dbojs.query({ flags: /room/i });

  if (!(await counters.query({ id: "objid" })).length) {
    await counters.create({ id: "objid", value: 1 });
  }

  if (!rooms.length) {
    await dbojs.create({
      id: "1",
      flags: "room safe void",
      data: {
        name: "The Void",
        description: "A featureless void, stretching endlessly in all directions."
      }
    });
  }
}

/**
 * Initialize default channels if they don't exist
 */
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



// Initialize the UrsaMU engine with custom configuration
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

// Start the game engine
if (import.meta.main) {
  // Global Error Handlers
  globalThis.addEventListener("unhandledrejection", (e) => {
    e.preventDefault();
    log("error", "Unhandled Rejection", e.reason);
  });

  globalThis.addEventListener("error", (e) => {
    e.preventDefault();
    log("error", "Uncaught Exception", e.error);
  });

  try {
    const game = await initializeEngine(config, undefined, { loadDefaultCommands: true });
    await checkAndCreateSuperuser();
    console.log(`${game.config.get("game.name")} main server is running!`);
  } catch (error) {
    log("error", "Fatal Initialization Error", error);
    Deno.exit(1);
  }
}

/**
 * Check if any players exist, and if not, print first-run instructions.
 * The first player to run `create <name> <password>` via telnet is
 * automatically granted superuser by src/commands/create.ts.
 */
export async function checkAndCreateSuperuser() {
  const players = await dbojs.query({ flags: /player/i });

  if (players.length === 0) {
    // Fresh database — print first-run instructions
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

  // Players exist but no superuser — promote the first player (lowest id)
  const superusers = await dbojs.query({ flags: /superuser/i });
  if (superusers.length === 0) {
    const sorted = players.slice().sort((a, b) => Number(a.id) - Number(b.id));
    const first = sorted[0];
    await setFlags(first, "superuser");
    const name = first.data?.name || first.id;
    console.log(`\n[Init] No superuser found — promoted '${name}' (#${first.id}) to superuser.\n`);
  }
}
