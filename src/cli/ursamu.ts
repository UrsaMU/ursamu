#!/usr/bin/env -S deno run -A

import { parse } from "https://deno.land/std@0.204.0/flags/mod.ts";
import { dirname, fromFileUrl, join } from "https://deno.land/std@0.204.0/path/mod.ts";

// Parse command line arguments
const args = parse(Deno.args, {
  boolean: ["help", "version"],
  alias: {
    h: "help",
    v: "version",
  },
});

// Show version
if (args.version) {
  console.log("UrsaMU CLI v1.0.0");
  Deno.exit(0);
}

// Show help if no command is provided or help flag is set
if (args.help || args._.length === 0) {
  showHelp();
  Deno.exit(0);
}

const command = args._[0];
const restArgs = args._.slice(1).map(arg => String(arg));

// Handle commands
switch (command) {
  case "create":
    // Run the create command
    await runCommand("create.ts", restArgs);
    break;
    
  case "help":
    showHelp();
    break;
    
  default:
    console.error(`Unknown command: ${command}`);
    console.log("Run 'ursamu help' for usage information");
    Deno.exit(1);
}

/**
 * Show help information
 */
function showHelp() {
  console.log(`
UrsaMU CLI

Usage:
  ursamu <command> [options]

Available commands:
  create <project-name>  Create a new UrsaMU project
  help                   Show this help message

Options:
  -h, --help             Show this help message
  -v, --version          Show version information

Examples:
  ursamu create my-game
  `);
}

/**
 * Run a CLI command
 * @param scriptName The name of the script to run
 * @param args Arguments to pass to the script
 */
async function runCommand(scriptName: string, args: string[]) {
  try {
    // Get the directory of the current script
    const currentDir = dirname(fromFileUrl(import.meta.url));
    const scriptPath = join(currentDir, scriptName);
    
    // Create a new process to run the command
    const command = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", scriptPath, ...args],
      stdout: "inherit",
      stderr: "inherit",
    });
    
    const process = command.spawn();
    const status = await process.status;
    
    if (!status.success) {
      Deno.exit(status.code);
    }
  } catch (error: unknown) {
    console.error(`Error running command: ${error instanceof Error ? error.message : String(error)}`);
    Deno.exit(1);
  }
} 