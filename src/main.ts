import { join } from "../deps.ts";
import { serve } from "https://deno.land/std@0.166.0/http/server.ts";
import { app, io } from "./app.ts";
import { plugins } from "./utils/loadDIr.ts";
import { loadTxtDir } from "./utils/loadTxtDir.ts";
import { createObj } from "./services/DBObjs/index.ts";
import { chans, dbojs, mail } from "./services/Database/index.ts";
import { setFlags } from "./utils/setFlags.ts";
import { broadcast } from "./services/broadcast/index.ts";
import { dpath } from "../deps.ts";
import { gameConfig } from "./config.ts";

export const mu = async () => {
  const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));

  // Pull plugin list from config, default to all of the built-ins
  const pluginsList = gameConfig.server?.plugins || [];

  plugins(join(__dirname, "./commands"));

  // Iterate and install plugins
  for (const plug of pluginsList) {
    if (plug.startsWith("http://") || plug.startsWith("https://")) {
      plugins(plug);
    } else {
      console.log(join(__dirname, plug));
      plugins(join(__dirname, plug));
    }
  }

  // Load text files (later should be overridable in data/)
  await loadTxtDir(join(__dirname, "../text"));
  await loadTxtDir(join(__dirname, "../help"));

  dbojs.init();
  chans.init();
  mail.init();

  const handler = io.handler(async (req: any) => {
    return await app.handle(req) || new Response("Not found.", { status: 404 });
  });

  serve(handler, { port: gameConfig.server?.ws });

  const rooms = await dbojs.query({ flags: /room/i });

  if (!rooms.length) {
    await createObj("room safe void", { name: "The Void" });
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
  mu();
}
