import path from "node:path";
import { server } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { createObj } from "./services/DBObjs/index.ts";
import { chans, counters, dbojs } from "./services/Database/index.ts";
import defaultConfig from "./ursamu.config.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { Config, IConfig, IPlugin } from "./@types/index.ts";
import { dpath } from "../deps.ts";

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url))
const __data = path.join(__dirname, "..", "data")
export const dataConfig = await (async () => {
  try {
    const raw = await Deno.readTextFile(path.join(__data, "config.json"))
    return JSON.parse(raw)
  } catch(e) {
    console.log("Unable to load data configuration, using defaults!", e)
    return {}
  }
})()

export const gameConfig = new Config(defaultConfig);

export const mu = async (cfg?: IConfig, plugs?: IPlugin[] = []) => {
  gameConfig.setConfig({ ...defaultConfig, ...cfg });

  const pluginsList = gameConfig.server.plugins || path.join(__dirname, "./commands");
  for(const plugin of plugs) {
    pluginsList.append(plugin)
  }
  plugins(pluginsList);
  loadTxtDir(path.join(__dirname, "../text"));

  server.listen(gameConfig.server?.ws, async () => {
    // load plugins
    for (const plugin of pluginsList) {
      try {
        if (plugin.init) {
          const res = await plugin.init();
          if (res) {
            gameConfig.setConfig({ ...gameConfig, ...plugin.config });
            console.log(`Plugin ${plugin.name} loaded.`);
          }
        }
      } catch (error) {
      console.log(error);
      }
    }

    const rooms = await dbojs.query({ flags: /room/i });

    const counter = {
      _id: "objid",
      seq: 0,
    };

    if (!(await counters.query({ _id: "objid" })).length) {
      await counters.create(counter);
    }

    if (!rooms.length) {
      const room = await createObj("room safe void", { name: "The Void" });
      console.log("The Void created.");
    }

    // create the default channels
    const channels = await chans.all();
    if (!channels.length) {
      console.log("No channels found, creating some!");
      await chans.create({
        name: "Public",
        header: "%ch%cc[Public]%cn",
        alias: "pub",
      });

      await chans.create({
        name: "Admin",
        header: "%ch%cy[Admin]%cn",
        alias: "ad",
        lock: "admin+",
      });
    }
    console.log(`Server started on port ${gameConfig.server?.ws}.`);
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

if (import.meta.main) mu(dataConfig);
