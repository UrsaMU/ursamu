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
      welcome: "../text/welcome.md",
    },
  },
  theme: {
    primary: "#f97316", // Orange 500 (Vibrant Brand Color)
    secondary: "#27272a", // Zinc 800 (Dark interactive elements)
    accent: "#fb923c", // Orange 400 (Lighter accent)
    background: "#000000", // Pure Black (Modern, clean, OLED friendly)
    surface: "#09090b", // Zinc 950 (Very subtle contrast from black)
    text: "#fafafa", // Zinc 50 (High legibility off-white)
    muted: "#a1a1aa", // Zinc 400 (Readable but distinct from primary text)
    glass: "rgba(9, 9, 11, 0.7)", // Dark Zinc Glass
    glassBorder: "rgba(255, 255, 255, 0.05)", // Ultra subtle border
    backgroundImage: "/images/default_bg.jpg", // Default Nebula
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