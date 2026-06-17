#!/usr/bin/env -S deno run -A

import { parse } from "@std/flags";
import { join } from "@std/path";

const CONFIG_PATH = join(Deno.cwd(), "config", "config.json");

// Parse command line arguments
const args = parse(Deno.args, {
  string: ["get", "set"],
  boolean: ["help", "reset"],
  alias: {
    h: "help",
    g: "get",
    s: "set",
    r: "reset",
  },
});

async function loadConfig(): Promise<Record<string, unknown>> {
  try {
    const text = await Deno.readTextFile(CONFIG_PATH);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function saveConfig(config: Record<string, unknown>): Promise<void> {
  await Deno.writeTextFile(CONFIG_PATH, JSON.stringify(config, null, 2));
}

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
  -r, --reset         Reset the configuration (deletes config/config.json)

Configuration File:
  ${CONFIG_PATH}

Examples:
  config.ts --get server.port
  config.ts --set server.port 4201
  config.ts --reset
  `);
  Deno.exit(0);
}

// Reset the configuration
if (args.reset) {
  const answer = prompt("Are you sure? This will delete config/config.json. (y/N)");
  if (answer?.trim().toLowerCase() !== "y") {
    console.log("Reset cancelled.");
    Deno.exit(0);
  }
  try {
    await Deno.remove(CONFIG_PATH);
    console.log("Configuration reset to default values (deleted config/config.json).");
  } catch {
    console.log("No custom configuration file to delete.");
  }
  Deno.exit(0);
}

// Dot notation helpers
// deno-lint-ignore no-explicit-any
function dotGet(obj: any, key: string): any {
  const parts = key.split(".");
  let cur = obj;
  for (const part of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    cur = cur[part];
  }
  return cur;
}

// deno-lint-ignore no-explicit-any
function dotSet(obj: any, key: string, value: any): void {
  const parts = key.split(".");
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (typeof cur[part] !== "object" || cur[part] === null) cur[part] = {};
    cur = cur[part];
  }
  cur[parts[parts.length - 1]] = value;
}

const config = await loadConfig();

// Get a configuration value
if (args.get) {
  const value = dotGet(config, args.get);
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
    if (typeof value === "string") value = JSON.parse(value);
  } catch {
    // If it's not valid JSON, use it as a string
  }

  dotSet(config, args.set, value);
  await saveConfig(config);
  console.log(`Configuration key '${args.set}' set to:`, value);
  Deno.exit(0);
}

// If no command is provided, show the entire configuration
console.log(JSON.stringify(config, null, 2));