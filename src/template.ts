/**
 * UrSamu Game Template
 * 
 * This file serves as a template for creating your own UrSamu-based game.
 * Copy this file to your project and modify it to suit your needs.
 */

import { mu, IConfig, IPlugin } from "./index.ts";
import path from "node:path";
import { dpath } from "../deps.ts";

// Define your custom configuration
const myConfig: IConfig = {
  // Override default configuration values
  game: {
    name: "My UrSamu Game",
    description: "A custom game built with UrSamu",
    version: "1.0.0",
    text: {
      connect: "connect.txt" // Path to connect text file
    }
  },
  server: {
    // Server configuration
    ws: 4202,    // WebSocket port
    http: 4201,  // HTTP port
    telnet: 4200 // Telnet port
  },
  // Add any other custom configuration options
};

// Define your custom plugins
const myPlugins: IPlugin[] = [
  // Example plugin
  {
    name: "my-custom-plugin",
    version: "1.0.0",
    description: "A custom plugin for my game",
    init: async () => {
      console.log("Initializing my custom plugin");
      return true;
    },
    remove: async () => {
      console.log("Removing my custom plugin");
    }
  }
];

// Get the current directory
const __dirname = dpath.dirname(dpath.fromFileUrl(import.meta.url));

// Define initialization options
const options = {
  loadDefaultCommands: true,      // Load default UrSamu commands
  loadDefaultTextFiles: true,     // Load default UrSamu text files
  autoCreateDefaultRooms: true,   // Create default rooms if none exist
  autoCreateDefaultChannels: true, // Create default channels if none exist
  customCommandsPath: path.join(__dirname, "../commands"), // Path to your custom commands
  customTextPath: path.join(__dirname, "../text"),         // Path to your custom text files
};

// Initialize the UrSamu engine
async function startGame() {
  try {
    // Initialize the engine with your custom configuration, plugins, and options
    const engine = await mu(myConfig, myPlugins, options);
    
    // You can access engine components here
    console.log(`${engine.config.get("game.name")} started successfully!`);
    
    // Add any additional initialization code here
    
  } catch (error) {
    console.error("Failed to start the game:", error);
  }
}

// Start the game if this file is being executed directly
// @ts-ignore: Deno specific property
if (import.meta.main) {
  startGame();
}

// Export the startGame function for use in other files
export { startGame }; 