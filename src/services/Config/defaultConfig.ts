import type { IConfig } from "../../@types/IConfig.ts";

// This is a minimal default configuration that will be used if no config.json exists
// The actual configuration should be managed through the config.json file in the /config directory
const defaultConfig: IConfig = {
  server: {
    telnet: 4201,
    ws: 4202,
    http: 4203,
    // These are now used as prefixes for Deno.Kv keys, not separate database files
    db: "db",           // Main database prefix
    chans: "channels",    // Channels prefix
    mail: "mail",         // Mail prefix
    wiki: "wiki",         // Wiki prefix
    bboard: "bboard",     // Bulletin board prefix
  },
  game: {
    name: "UrsaMU",
    description: "A Modern MUSH-Like engine written in Typescript.",
    version: "0.0.1",
    playerStart: "1",
    text: {
      connect: "../text/default_connect.txt",
    },
  },
  discord: {
    token: "",
    clientId: "",
    guildId: "",
    channels: {},
  },
  plugins: {},
};

export default defaultConfig; 