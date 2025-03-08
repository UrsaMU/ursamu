#!/usr/bin/env -S deno run -A

import { parse } from "https://deno.land/std/flags/mod.ts";
import { dpath } from "../../deps.ts";
import { ConfigManager } from "../services/Config/index.ts";
import defaultConfig from "../ursamu.config.ts";

// Parse command line arguments
const args = parse(Deno.args, {
  string: ["get", "set", "file"],
  boolean: ["help", "reset"],
  alias: {
    h: "help",
    g: "get",
    s: "set",
    f: "file",
    r: "reset",
  },
});

// Initialize the config manager with default config
// It will automatically use the /config directory at the project root
const configManager = ConfigManager.init(defaultConfig);

// Get the config directory
const configDir = configManager.getConfigDir();

// Show help
if (args.help) {
  console.log(`
UrsaMU Configuration CLI

Usage:
  config.ts [options]

Options:
  -h, --help          Show this help message
  -g, --get <key>     Get a configuration value
  -s, --set <key>     Set a configuration value (requires a value)
  -r, --reset         Reset the configuration to default values

Configuration Directory:
  ${configDir}

Examples:
  config.ts --get server.ws
  config.ts --set server.ws 4202
  config.ts --reset
  `);
  Deno.exit(0);
}

// Reset the configuration
if (args.reset) {
  configManager.reset();
  console.log("Configuration reset to default values");
  Deno.exit(0);
}

// Get a configuration value
if (args.get) {
  const value = configManager.get(args.get);
  if (value === undefined) {
    console.log(`Configuration key '${args.get}' not found`);
  } else {
    console.log(JSON.stringify(value, null, 2));
  }
  Deno.exit(0);
}

// Set a configuration value
if (args.set) {
  if (args._.length === 0) {
    console.error("Error: No value provided for --set");
    Deno.exit(1);
  }
  
  let value = args._[0];
  
  // Try to parse the value as JSON
  try {
    value = JSON.parse(value);
  } catch {
    // If it's not valid JSON, use it as a string
  }
  
  configManager.set(args.set, value);
  configManager.saveConfig();
  console.log(`Configuration key '${args.set}' set to:`, value);
  Deno.exit(0);
}

// If no command is provided, show the entire configuration
console.log(JSON.stringify(configManager.getAll(), null, 2)); 