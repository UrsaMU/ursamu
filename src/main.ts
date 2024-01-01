import { join } from "../deps.ts";
import { serve } from "https://deno.land/std@0.166.0/http/server.ts";
import { app, io } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { createObj } from "./services/DBObjs/index.ts";
import { chans, counters, dbojs, mail } from "./services/Database/index.ts";
import defaultConfig from "./ursamu.config.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { Config, IConfig, IPlugin } from "./@types/index.ts";
import { dpath } from "../deps.ts";
import { setAllStats } from "./services/characters/index.ts";

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
const __data = join(__dirname, "..", "data");

export const gameConfig = new Config(defaultConfig);

export const mu = async () => {
  // Pull config from data/ if it exists
  const dataConfig = await (async () => {
    try {
      const ret = await import("../data/config.ts");
      return ret.default;
    } catch(e) {
      console.log("Unable to load data/config.ts:", e);
      return {};
    }
  })();

  dataConfig.server = dataConfig.server ? dataConfig.server : {};
  dataConfig.game = dataConfig.game ? dataConfig.game : {};

  // With the default ursamu.config.ts as the defaults
  gameConfig.setConfig({
    server: { ...defaultConfig.server, ...dataConfig.server },
    game: { ...defaultConfig.game, ...dataConfig.game },
  });

  // Pull plugin list from config, default to all of the built-ins
  const pluginsList = gameConfig.server?.plugins || [ "./commands" ];

  // Iterate and install plugins
  for (const plug of pluginsList) {
    if (plug.startsWith("http://") || plug.startsWith("https://")) {
      plugins(plug);
    } else {
      plugins(join(__dirname, plug));
    }
  }

  // Install stats if they exist
  if(gameConfig.server?.allStats) {
    setAllStats(gameConfig.server?.allStats);
  }

  // Load text files (later should be overridable in data/)
  loadTxtDir(join(__dirname, "../text"));

  dbojs.init(gameConfig.server?.db);
  counters.init(gameConfig.server?.db);
  chans.init(gameConfig.server?.db);
  mail.init(gameConfig.server?.db);

  const handler = io.handler(async (req: any) => {
    return await app.handle(req) || new Response("Not found.", { status: 404 });
  });

  serve(handler, { port: gameConfig.server?.ws });

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

  Deno.addSignalListener("SIGINT", async () => {
    const players = await dbojs.query({ flags: /connected/i });

    for (const player of players) {
      await setFlags(player, "!connected");
    }

    await broadcast("Server shutting down.");
    Deno.exit(0);
  });
};

if (import.meta.main) {
  mu(dataConfig);
}
