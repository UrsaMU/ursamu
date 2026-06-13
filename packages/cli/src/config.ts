#!/usr/bin/env -S deno run -A

import { parse } from "jsr:@std/flags@^0.224.0";
import { join } from "jsr:@std/path@^0.224.0";

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

const configDir = join(Deno.cwd(), "config");
const configPath = join(configDir, "config.json");

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

async function readConfig(): Promise<Record<string, unknown>> {
  try {
    const text = await Deno.readTextFile(configPath);
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function writeConfig(config: Record<string, unknown>): Promise<void> {
  try {
    await Deno.mkdir(configDir, { recursive: true });
    await Deno.writeTextFile(configPath, JSON.stringify(config, null, 2));
  } catch (error) {
    console.error("Error saving configuration:", error);
  }
}

function getValueByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setValueByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!(part in current) || typeof current[part] !== 'object' || current[part] === null) {
      current[part] = {};
    }
    current = current[part] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}

// Reset the configuration
if (args.reset) {
  const answer = prompt("Are you sure? This will reset all settings. (y/N)");
  if (answer?.trim().toLowerCase() !== "y") {
    console.log("Reset cancelled.");
    Deno.exit(0);
  }
  await writeConfig({});
  console.log("Configuration reset to default values");
  Deno.exit(0);
}

const config = await readConfig();

// Get a configuration value
if (args.get) {
  const value = getValueByPath(config, args.get);
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

  setValueByPath(config, args.set, value);
  await writeConfig(config);
  console.log(`Configuration key '${args.set}' set to:`, value);
  Deno.exit(0);
}

// If no command is provided, show the entire configuration
console.log(JSON.stringify(config, null, 2));
