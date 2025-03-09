/**
 * Simple UrSamu Game Example
 * 
 * This is a minimal example of how to use UrSamu as a library to create a custom game.
 */

import { mu, IConfig, IPlugin } from "../../mod.ts";
import path from "node:path";
import { dpath } from "../../deps.ts";

// Get the current directory
const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));

// Define a custom configuration
const config: IConfig = {
  game: {
    name: "Simple UrSamu Game",
    description: "A simple example game built with UrSamu",
    version: "1.0.0",
    text: {
      connect: "connect.txt"
    }
  },
  server: {
    ws: 4202,
    http: 4201,
    telnet: 4200
  }
};

// Define a custom plugin
const plugins: IPlugin[] = [
  {
    name: "simple-game-plugin",
    version: "1.0.0",
    description: "A simple plugin for the example game",
    init: async () => {
      console.log("Initializing simple game plugin");
      return true;
    }
  }
];

// Define initialization options
const options = {
  loadDefaultCommands: true,
  loadDefaultTextFiles: true,
  autoCreateDefaultRooms: true,
  autoCreateDefaultChannels: true,
  customCommandsPath: path.join(__dirname, "commands"),
  customTextPath: path.join(__dirname, "text"),
};

// Initialize the UrSamu engine
async function startGame() {
  try {
    console.log("Starting Simple UrSamu Game...");
    const engine = await mu(config, plugins, options);
    console.log(`${engine.config.get("game.name")} started successfully!`);
    console.log(`Connect to the game via telnet on port ${engine.config.get("server.telnet")}`);
    console.log(`Or connect to the web client at http://localhost:${engine.config.get("server.http")}`);
  } catch (error) {
    console.error("Failed to start the game:", error);
  }
}

// Start the game if this file is being executed directly
// @ts-ignore: Deno specific property
if (import.meta.main) {
  startGame();
}

export { startGame }; 