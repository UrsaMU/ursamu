import path from "node:path";
import { server } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { chans, counters, dbojs } from "./services/Database/index.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { IConfig, IPlugin } from "./@types/index.ts";
import { dpath } from "../deps.ts";
import { initConfig, initializePlugins, getConfig } from "./services/Config/mod.ts";
import { loadPlugins } from "./utils/loadPlugins.ts";

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
  } = {}
) => {
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
    plugins(path.join(__dirname, "./commands"));
  }
  
  // Load custom commands if path provided
  if (customCommandsPath) {
    plugins(customCommandsPath);
  }

  // Load default text files if enabled
  if (loadDefaultTextFiles) {
    loadTxtDir(path.join(__dirname, "../text"));
  }
  
  // Load custom text files if path provided
  if (customTextPath) {
    loadTxtDir(customTextPath);
  }

  // Load plugins from the plugins directory
  const pluginsDir = path.join(__dirname, "./plugins");
  const loadedPlugins = await loadPlugins(pluginsDir);
  
  // Add any custom plugins
  if (customPlugins && customPlugins.length > 0) {
    console.log(`Loading ${customPlugins.length} custom plugins...`);
    for (const plugin of customPlugins) {
      loadedPlugins.push(plugin);
    }
  }

  // Start the WebSocket server
  server.listen(getConfig<number>("server.ws"), async () => {
    // Initialize all registered plugins
    await initializePlugins();

    if (autoCreateDefaultRooms) {
      await initializeDefaultRooms();
    }

    if (autoCreateDefaultChannels) {
      await initializeDefaultChannels();
    }
    
    console.log(`WebSocket server started on port ${getConfig<number>("server.ws")}.`);
    
    // Start the HTTP server
    const httpPort = getConfig<number>("server.http");
    
    // Use Deno.serve instead of Deno.listen and Deno.serveHttp
    Deno.serve({ port: httpPort }, () => {
      try {        
        // For now, just return a simple response
        // You can implement proper routing later
        return new Response("UrsaMU API Server", { 
          status: 200,
          headers: { "Content-Type": "application/json" }
        });
      } catch (error) {
        console.error("Error handling request:", error);
        return new Response("Internal Server Error", { status: 500 });
      }
    });
    
    console.log(`HTTP server started on port ${httpPort}.`);
  });

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
    server,
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
    counters: "data/counters.db",
    chans: "data/chans.db",
    mail: "data/mail.db",
    bboard: "data/bboard.db"
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
  const game = await initializeEngine(config);
  console.log(`${game.config.get("game.name")} main server is running!`);
}
