import { join, merge } from "../deps.ts";
import { serve } from "https://deno.land/std@0.166.0/http/server.ts";
import { app, io } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { createObj } from "./services/DBObjs/index.ts";
import { chans, counters, dbojs, mail } from "./services/Database/index.ts";
import defaultConfig from "./ursamu.config.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { Config, IConfig } from "./@types/index.ts";
import { dpath } from "../deps.ts";
import { bboard } from "./services/index.ts";

const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));
const __data = join(__dirname, "..", "data");
export const dataConfig = await (async () => {
  try {
    const raw = await Deno.readTextFile(join(__data, "config.json"));
    return JSON.parse(raw);
  } catch (e) {
    console.log("Unable to load data configuration, using defaults!", e);
    return {};
  }
})();

export const gameConfig = new Config(defaultConfig);

export const mu = async (cfg?: IConfig, ...plugs: string[]) => {
  gameConfig.setConfig(merge(gameConfig.config, cfg || {}));

  const pluginsList = gameConfig.server?.plugins || [];

  plugins(join(__dirname, "./commands"));
  for (const plug of pluginsList) {
    if (plug.startsWith("http://") || plug.startsWith("https://")) {
      plugins(plug);
    } else {
      plugins(join(__dirname, plug));
    }
  }

  loadTxtDir(join(__dirname, "../text"));
  loadTxtDir(join(__dirname, "../help"));

  dbojs.init(gameConfig.server?.db || "mongodb://root:root@mongo/");
  counters.init(gameConfig.server?.db || "mongodb://root:root@mongo/");
  chans.init(gameConfig.server?.db || "mongodb://root:root@mongo/");
  mail.init(gameConfig.server?.db || "mongodb://root:root@mongo/");
  bboard.init(gameConfig.server?.db || "mongodb://root:root@mongo/");

  const handler = io.handler(async (req: any) => {
    return await app.handle(req) || new Response("Not found.", { status: 404 });
  });

  serve(handler, { port: gameConfig.server?.ws });

  const rooms = await dbojs.query({ flags: /room/i });

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
