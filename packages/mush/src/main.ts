
/**
 * @module ursamu-core
 * @description The core engine initialization and management module.
 */
// Load .env if present; skip .env.example key enforcement so plugin
// packages with their own examples do not break engine boot / tests.
import { loadSync as loadEnvSync } from "@std/dotenv";
try {
  loadEnvSync({
    export: true,
    allowEmptyValues: true,
    examplePath: null,
  });
} catch {
  /* no .env — fine for tests and fresh installs */
}
import { handleRequest } from "./app.ts";
import "./reboot.ts";
import { plugins, loadTxtDir, setFlags, loadPlugins, txtFiles } from "./main_utils.ts";
import {
  queue,
  initConfig,
  loadPlugins as initializePlugins,
  getConfig,
  setConfig,
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
  DBO,
} from "@ursamu/core";
import type { IPlugin } from "@ursamu/core";
import * as dpath from "@std/path";
import { runStartupAttrs } from "./world/startup.ts";
import { runSoftcodeSimple } from "./softcode/engine.ts";
import {
  dbojs,
  chans,
  counters,
  texts,
  createObj,
} from "./world/dbobjs.ts";
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

  // Load layout mushcode templates (header / divider / footer)
  const { applyLayoutFromConfig } = await import("./format/handlers.ts");
  applyLayoutFromConfig(
    getConfig<{
      header?: string;
      divider?: string;
      footer?: string;
    }>("game.layout"),
  );

  // Determine the project root and current directory context
  const isLocal = import.meta.url.startsWith("file://") &&
    !Deno.env.get("URSAMU_JSR_MODE");
  
  // Load default commands if enabled
  if (loadDefaultCommands) {
    const { loadDefaultCommands: loadCmds } = await import("./commands/addCmd.ts");
    await loadCmds();
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
  // If JSR, plugins is expected in ./src/plugins (relative to CWD)
  const pluginsDir = pluginsDirOverride === "" ? "" : (pluginsDirOverride ??
    (isLocal
      ? dpath.join(__dirname, "./plugins")
      : dpath.join(Deno.cwd(), "src", "plugins")));

  // Only try to load if directory exists
  let loadedPlugins: IPlugin[] = [];
  try {
    // Check if directory exists before loading
    if (
      pluginsDir &&
      (await Deno.stat(pluginsDir).then((info) => info.isDirectory).catch(
        () => false,
      ))
    ) {
      loadedPlugins = await loadPlugins(pluginsDir);
    }
  } catch (e) {
    if (pluginsDir) {
      console.warn(`Could not load plugins from ${pluginsDir}:`, e);
    }
  }

  // Share loaded plugins with @reload command for hot-reload
  try {
    const { setLoadedPlugins } = await import("./verbs/admin-reload.ts");
    setLoadedPlugins(loadedPlugins);
  } catch { /* reload command may not be loaded yet */ }

  // Load plugins specified in the config
  const configPlugins = getConfig<unknown>("server.plugins") ||
    getConfig<unknown>("plugins");
  if (Array.isArray(configPlugins)) {
    for (const pluginSpec of configPlugins) {
      if (typeof pluginSpec === "string") {
        try {
          console.log(`[startup] Loading config plugin: ${pluginSpec}`);
          let importPath = pluginSpec;
          if (importPath.startsWith(".")) {
            importPath = dpath.toFileUrl(
              dpath.resolve(Deno.cwd(), importPath),
            ).href;
          } else if (importPath.startsWith("/")) {
            importPath = dpath.toFileUrl(importPath).href;
          }
          const module = await import(importPath);
          const candidate = module.default ?? module.plugin;
          if (candidate && typeof candidate === "object") {
            const plugin = candidate as IPlugin;
            registerPlugin(plugin);
            loadedPlugins.push(plugin);
          } else {
            console.warn(
              `[startup] Plugin at ${pluginSpec} ` +
                `does not export a default/plugin object`,
            );
          }
        } catch (error) {
          console.error(
            `[startup] Error loading plugin from config ` +
              `spec '${pluginSpec}':`,
            error,
          );
        }
      }
    }
  }

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
  const wsPort   = getConfig<number>("server.wsPort")   || getConfig<number>("server.ws")      || 4202;
  const httpPort = getConfig<number>("server.apiPort") || getConfig<number>("server.port")    || 4203;
  const tnPort   = getConfig<number>("server.telnet")  || getConfig<number>("server.telnetPort") || 4201;

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
  if (getConfig<boolean>("server.standaloneTelnet") !== true && tnPort > 0) {
    server.addTransport(telnetTransport);
  }
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

  // Send welcome screen on new session. Reconnects skip the splash only
  // while JWT reauth is expected; if reauth fails the session is closed
  // (see session:auth in commands/sdk.ts) so players are never left on a
  // blank "connected but not logged in" prompt.
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
        (s) => s.socketId !== socketId && (s as { actorId?: string | null }).actorId === actorId
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

  const shutdownGracefully = async (): Promise<void> => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    broadcastAll("Server shutting down.");
    await DBO.close();
    Deno.exit(0);
  };

  Deno.addSignalListener("SIGINT", shutdownGracefully);
  Deno.addSignalListener("SIGTERM", shutdownGracefully);

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
  // Counter must start at 0 so the first atomicIncrement yields "1".
  if (!(await counters.query({ id: "objid" })).length) {
    await counters.create({ id: "objid", value: 0 });
  }

  let rooms = await dbojs.query({ flags: /room/i });

  if (!rooms.length) {
    // Prefer id "1" when free — matches game.playerStart default.
    const idOne = await dbojs.queryOne({ id: "1" });
    if (!idOne) {
      await dbojs.create({
        id: "1",
        flags: "room safe",
        data: {
          name: "OOC Lounge",
          description:
            "A comfortable out-of-character lounge. Soft chairs, " +
            "quiet conversation, and a place to catch your breath " +
            "between scenes.",
        },
      });
      // Ensure later createObj calls allocate ids > 1.
      const ctr = await counters.queryOne({ id: "objid" });
      const n = Math.max(1, Number(ctr?.value ?? 0) || 0);
      if (ctr) {
        await counters.modify({ id: "objid" }, "$set", {
          value: n,
        });
      }
    } else {
      // #1 is occupied (often a mis-seeded player). Allocate a new room.
      const made = await createObj("room safe", {
        name: "OOC Lounge",
        description:
          "A comfortable out-of-character lounge. Soft chairs, " +
          "quiet conversation, and a place to catch your breath " +
          "between scenes.",
      });
      const roomId = made[0]?.id;
      if (roomId && getConfig<string>("game.playerStart", "1") === "1") {
        setConfig("game.playerStart", roomId);
        console.log(
          `[startup] playerStart retargeted to OOC Lounge (#${roomId}).`,
        );
      }
    }
    rooms = await dbojs.query({ flags: /room/i });
  }

  // Players whose location is missing or not a room end up "looking at
  // themselves". Park them in playerStart / first room.
  await repairPlayerLocations(rooms);
}

async function repairPlayerLocations(
  rooms: Awaited<ReturnType<typeof dbojs.query>>,
): Promise<void> {
  if (!rooms.length) return;

  const startId =
    getConfig<string>("game.playerStart") || rooms[0].id;
  const startRoom =
    rooms.find((r) => r.id === startId) ?? rooms[0];
  const roomIds = new Set(rooms.map((r) => r.id));

  const players = await dbojs.query({ flags: /player/i });
  let moved = 0;
  for (const p of players) {
    const loc = p.location;
    if (loc && roomIds.has(loc) && loc !== p.id) continue;
    await dbojs.modify({ id: p.id }, "$set", {
      location: startRoom.id,
    });
    moved++;
  }
  if (moved > 0) {
    console.log(
      `[startup] Moved ${moved} player(s) into ` +
        `${startRoom.data?.name ?? "start room"} (#${startRoom.id}).`,
    );
  }
}

/**
 * Initialize default channels if they don't exist.
 * Prefer plugins.channels.defaults (same shape as @ursamu/channels)
 * so the engine and plugin seed identical records.
 */
async function initializeDefaultChannels() {
  const channels = await chans.all();
  if (channels.length) return;

  // Skip when @ursamu/channels will seed on engine:ready —
  // avoids duplicate Public rows (id "pub" vs "public").
  const pluginList = getConfig<string[]>("server.plugins", []) ?? [];
  if (pluginList.some((p) => /channels/i.test(p))) {
    console.log(
      "[startup] Skipping built-in channel seed — " +
        "@ursamu/channels will seed from config.",
    );
    return;
  }

  type ChanDef = { name: string; alias: string; lock?: string };
  const defaults = getConfig<ChanDef[]>("plugins.channels.defaults") ?? [
    { name: "Public", alias: "pub", lock: "connected" },
    { name: "Admin", alias: "ad", lock: "connected admin+" },
  ];

  for (const def of defaults) {
    const id = def.name.toLowerCase();
    await chans.create({
      id,
      name: def.name,
      header: `%ch%cc[${def.name}]%cn`,
      alias: def.alias,
      lock: def.lock || "",
    });
    console.log(`[startup] Seeded channel ${def.name} (${def.alias})`);
  }
}



// Initialize the UrsaMU engine with custom configuration
const config = {
  server: {
    standaloneTelnet: true,
    telnet: 4201,
    wsPort: 4202,
    ws: 4202,
    http: 4203,
    port: 4203,
    apiPort: 4203,
    db: "data/typegraph.db",
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
    console.log("│    create <name> <passphrase>                       │");
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
