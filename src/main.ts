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
plugins(path.join(__dirname, "./commands"));
loadTxtDir(path.join(__dirname, "../text"));
export const gameConfig = new Config(defaultConfig);

export const mu = async (cfg?: IConfig, plugins?: IPlugin[]) => {
  gameConfig.setConfig({ ...defaultConfig, ...cfg });

  server.listen(gameConfig.server?.ws, async () => {
    // load plugins
    if (plugins) {
      for (const plugin of plugins) {
        try {
          if (plugin.init) {
            const res = await plugin.init();
            if (res) {
              gameConfig.setConfig({ ...defaultConfig, ...plugin.config });
              console.log(`Plugin ${plugin.name} loaded.`);
            }
          }
        } catch (error) {
          console.log(error);
        }
      }
    }

    const rooms = await dbojs.find({ flags: /room/i });

    const counter = {
      _id: "objid",
      seq: 0,
    };

    if (!(await counters.findOne({ _id: "objid" }))) {
      await counters.insert(counter);
    }

    if (!rooms.length) {
      const room = await createObj("room safe void", { name: "The Void" });
      console.log("The Void created.");
    }

    // create the default channels
    const channels = await chans.find({});
    if (!channels.length) {
      console.log("No channels found, creating some!");
      await chans.insert({
        name: "Public",
        header: "%ch%cc[Public]%cn",
        alias: "pub",
      });

      await chans.insert({
        name: "Admin",
        header: "%ch%cy[Admin]%cn",
        alias: "ad",
        lock: "admin+",
      });
    }
    console.log(`Server started on port ${gameConfig.server?.ws}.`);
  });

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.find({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    await broadcast("Server shutting down.");
    process.exit(0);
  });
};

if (import.meta.main) mu();
