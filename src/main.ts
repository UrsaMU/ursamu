
import { handleRequest } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { chans, counters, dbojs } from "./services/Database/index.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { IConfig, IPlugin } from "./@types/index.ts";
import { dpath } from "../deps.ts";
import { initConfig, initializePlugins, getConfig } from "./services/Config/mod.ts";
import { loadPlugins } from "./utils/loadPlugins.ts";
import { wsService } from "./services/WebSocket/index.ts";
import { hash, genSalt } from "../deps.ts";
import { getNextId } from "./utils/getNextId.ts";

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));

/**
 * UrSamu MU Engine - Core initialization function
 * 
 * This function initializes the UrSamu engine with the provided configuration and plugins.
 * It can be used both as a standalone application and as a library.
 * 
 * @param cfg Optional custom configuration to override defaults
 * @param customPlugins Optional array of custom plugins to load
 * @param options Additional options for customizing the initialization
 * @returns An object containing references to the initialized components
 */
export const initializeEngine = async (
  cfg?: IConfig,
  customPlugins?: IPlugin[],
  options: {
    loadDefaultCommands?: boolean;
    loadDefaultTextFiles?: boolean;
    autoCreateDefaultRooms?: boolean;
    autoCreateDefaultChannels?: boolean;
    customCommandsPath?: string;
    customTextPath?: string;
  } = {},
): Promise<Record<string, any>> => {
  // Set default options
  const {
    loadDefaultCommands = true,
    loadDefaultTextFiles = true,
    autoCreateDefaultRooms = true,
    autoCreateDefaultChannels = true,
    customCommandsPath,
    customTextPath,
  } = options;

  // Initialize the configuration system
  initConfig(cfg);

  // Load default commands if enabled
  if (loadDefaultCommands) {
    plugins(dpath.join(__dirname, "./commands"));
  }

  // Load custom commands if path provided
  if (customCommandsPath) {
    plugins(customCommandsPath);
  }

  // Load default text files if enabled
  if (loadDefaultTextFiles) {
    loadTxtDir(dpath.join(__dirname, "../text"));
  }

  // Load custom text files if path provided
  if (customTextPath) {
    loadTxtDir(customTextPath);
  }

  // Load plugins from the plugins directory
  const pluginsDir = dpath.join(__dirname, "./plugins");
  const loadedPlugins = await loadPlugins(pluginsDir);

  // Add any custom plugins
  if (customPlugins && customPlugins.length > 0) {
    console.log(`Loading ${customPlugins.length} custom plugins...`);
    for (const plugin of customPlugins) {
      loadedPlugins.push(plugin);
    }
  }

  // Start the consolidated Deno.serve for HTTP and WebSockets
  const httpPort = getConfig<number>("server.http") || 4203;

  Deno.serve({ port: httpPort }, async (req) => {
    try {
      // Handle WebSocket upgrade
      if (req.headers.get("upgrade") === "websocket") {
        const { socket, response } = Deno.upgradeWebSocket(req);
        wsService.handleConnection(socket);
        return response;
      }

      // Handle standard HTTP requests
      return await handleRequest(req);
    } catch (error) {
      console.error("Error handling request:", error);
      return new Response(JSON.stringify({ error: "Internal Server Error" }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  });

  // Initialize all registered plugins
  await initializePlugins();

  if (autoCreateDefaultRooms) {
    await initializeDefaultRooms();
  }

  if (autoCreateDefaultChannels) {
    await initializeDefaultChannels();
  }

  console.log(`Server started on port ${httpPort} (HTTP & WebSockets).`);

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    await broadcast("Server shutting down.");
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
    },
    broadcast,
    setFlags,
  };
};

// Export initializeEngine as mu for backward compatibility
export const mu = initializeEngine;

/**
 * Initialize default rooms if they don't exist
 */
async function initializeDefaultRooms() {
  console.log("Checking for existing rooms...");
  const rooms = await dbojs.query({ flags: /room/i });
  console.log(`Found ${rooms.length} rooms`);

  console.log("Checking counter...");
  const counter = {
    id: "objid",
    seq: 1, // Start at 1 since we want first room to be ID 1
  };

  if (!(await counters.query({ id: "objid" })).length) {
    console.log("Creating counter...");
    await counters.create(counter);
  }

  if (!rooms.length) {
    console.log("No rooms found. Creating The Void...");
    const voidRoom = {
      id: "1",
      flags: "room safe void",
      data: {
        name: "The Void",
        description: "A featureless void, stretching endlessly in all directions."
      }
    };
    const room = await dbojs.create(voidRoom);
    console.log("The Void created with ID:", room.id);
  }
}

/**
 * Initialize default channels if they don't exist
 */
async function initializeDefaultChannels() {
  console.log("Checking for channels...");
  const channels = await chans.all();
  console.log(`Found ${channels.length} channels`);

  if (!channels.length) {
    console.log("Creating default channels...");
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
    console.log("Default channels created");
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
    const game = await initializeEngine(config);
    await checkAndCreateSuperuser();
    console.log(`${game.config.get("game.name")} main server is running!`);
  } catch (error) {
    await logError(error, "Fatal Initialization Error");
    Deno.exit(1);
  }
}

/**
 * Check if any players exist, and if not, prompt to create a superuser
 */
async function checkAndCreateSuperuser() {
  const players = await dbojs.query({ flags: /player/i });

  if (players.length === 0) {
    console.log("\nNo players found in the database.");
    console.log("Welcome! Let's set up your superuser account.\n");

    const getRes = (text: string) => {
      const val = prompt(text);
      if (val === null) return null;
      return val.trim();
    };

    let email = getRes("Enter email address:");
    if (email === null) {
      console.log("Unable to read input (non-interactive mode detected).");
      console.log("To set up a superuser, please run the server interactively:");
      console.log("  deno task server");
      console.log("Skipping superuser creation for now.\n");
      return;
    }

    while (!email) {
      email = getRes("Enter email address:");
      if (email === null) return;
    }

    let username = getRes("Enter username:");
    if (username === null) return;
    while (!username) {
      username = getRes("Enter username:");
      if (username === null) return;
    }

    let password = getRes("Enter password:");
    if (password === null) return;
    while (!password) {
      password = getRes("Enter password:");
      if (password === null) return;
    }

    const id = await getNextId("objid");
    
    // Create the superuser
    await dbojs.create({
      id,
      flags: "player connected superuser",
      data: {
        name: username,
        email,
        password: await hash(password, await genSalt(10)),
        home: "1",
      },
      location: "1",
    });

    console.log(`\nSuperuser '${username}' created successfully!`);
  }
}
