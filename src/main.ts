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

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url))
plugins(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));

export const mu = async (cfg?: IConfig, customPlugins?: IPlugin[]) => {
  // Initialize the configuration system
  initConfig(cfg);

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

  server.listen(getConfig<number>("server.ws"), async () => {
    // Initialize all registered plugins
    await initializePlugins();

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

    // create the default channels if they don't exist
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
    console.log(`Server started on port ${getConfig<number>("server.ws")}.`);
  });

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    await broadcast("Server shutting down.");
    Deno.exit(0);
  });
};

if (import.meta.main) mu();
