#!/usr/bin/env -S deno run -A


/**
 * @module ursamu-cli
 * @description The Command Line Interface for UrsaMU.
 *
 * This module provides the `ursamu` command, which handles project creation (`init`),
 * plugin management (`plugin`), and other utility tasks.
 */
import { parse } from "@std/flags";
import { join, dirname, fromFileUrl } from "@std/path";
import { existsSync } from "@std/fs";
import parser from "../services/parser/parser.ts";

const fmt = (str: string) => parser.substitute("telnet", str);

const getRes = (text: string, defaultValue?: string) => {
  const promptText = defaultValue ? `${text} [${defaultValue}]: ` : `${text}: `;
  const val = prompt(promptText);
  if (val === null || val.trim() === "") return defaultValue || "";
  return val.trim();
};

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
// Show help if help flag is set
if (args.help) {
  showHelp();
  Deno.exit(0);
}

// Interactive mode if no args
if (args._.length === 0) {
  console.log(fmt(`
%ch%cc==================================================%cn
%ch%cw        Welcome to the %cyUrsaMU%cw CLI%cn
%ch%cc==================================================%cn
%cw
Select an action:
%cn`));

  console.log("1. Create a new UrsaMU Game Project");
  console.log("2. Create a new UrsaMU Plugin Project");
  console.log("3. Manage Plugins (install, list, remove)");
  console.log("4. Exit");

  const choice = getRes("Selection", "1");

  switch (choice) {
    case "1":
      await initProject();
      Deno.exit(0);
      break;
    case "2":
      await runCommand("plugin.ts", ["init"]);
      Deno.exit(0);
      break;
    case "3":
       // For plugin management, we need more context.
       // Let's prompt for the subcommand.
       console.log("\nPlugin Management:");
       console.log("1. List installed plugins");
       console.log("2. Install a plugin");
       console.log("3. Remove a plugin");
       
       const pChoice = getRes("Selection", "1");
       switch(pChoice) {
         case "1": { await runCommand("plugin.ts", ["list"]); break; }
         case "2": {
            const url = getRes("GitHub URL");
            await runCommand("plugin.ts", ["install", url]); 
            break;
         }
         case "3": {
            const name = getRes("Plugin Name");
            await runCommand("plugin.ts", ["remove", name]);
            break;
         }
         default: console.log("Invalid selection."); break;
       }
       Deno.exit(0);
       break;
    case "4":
      Deno.exit(0);
      break;
    default:
      console.log("Invalid selection.");
      Deno.exit(1);
  }
}

/**
 * Initialize a new UrsaMU project (Interactive Wizard)
 */
function initProject() {
  console.log(fmt(`
%ch%cc==================================================%cn
%ch%cw        Welcome to the %cyUrsaMU%cw Setup Wizard%cn
%ch%cc==================================================%cn
%cw
This wizard will help you bootstrap your new MU* 
project in seconds.
%cn`));

  // 1. Project Information
  const projectName = getRes("Project Name", "my-ursamu-game");
  const targetDir = join(Deno.cwd(), projectName);

  if (existsSync(targetDir)) {
    console.error(fmt(`\n%crError: Directory already exists at ${targetDir}.%cn`));
    Deno.exit(1);
  }

  // 2. Configuration Defaults
  console.log(fmt("\n%ch%cy--- Network Configuration ---%cn"));
  const telnetPort = getRes("Telnet Port", "4201");
  const httpPort = getRes("Web API/WS Port", "4203");

  console.log(fmt("\n%ch%cy--- Game Details ---%cn"));
  const gameName = getRes("Game Name", projectName);
  const gameDesc = getRes("Game Description", "A modern MU* game.");

  console.log(fmt(`\n%ch%cgPreparing to create project in: %cy${targetDir}%cn`));

  // 3. Create Structure
  try {
    Deno.mkdirSync(targetDir);
    const dirs = ["config", "data", "src", "src/plugins", "text", "help", "scripts"];
    for (const dir of dirs) {
      Deno.mkdirSync(join(targetDir, dir), { recursive: true });
    }

    // 4. Scaffold Files
    
    // main.ts
    const mainTs = `import { mu } from "ursamu";

const game = await mu(); // Load config from config/config.json
console.log(\`\${game.config.get("game.name")} is live!\`);
`;

    // config/config.json
    const configJson = {
      server: {
        telnet: parseInt(telnetPort),
        ws: 4202,
        http: parseInt(httpPort),
        db: "data/ursamu.db",
        counters: "counters",
        chans: "chans",
        mail: "mail",
        bboard: "bboard"
      },
      game: {
        name: gameName,
        description: gameDesc,
        version: "0.0.1",
        text: {
          connect: "text/default_connect.txt"
        },
        playerStart: "1"
      }
    };
    Deno.writeTextFileSync(join(targetDir, "config", "config.json"), JSON.stringify(configJson, null, 2));

    // deno.json
    const denoJson = `{
  "tasks": {
    "start": "deno run -A --unstable-detect-cjs --unstable-kv jsr:@ursamu/ursamu/start",
    "server": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/main.ts",
    "telnet": "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/telnet.ts"
  },
  "imports": {
    "ursamu": "jsr:@ursamu/ursamu"
  }
}`;

    // connect text
    const connectText = `%ch%cc==================================%cn
%ch%cw Welcome to %cy${gameName}%cn
%ch%cc==================================%cn

A modern MUSH-like engine written in TypeScript.

%ch%cwType %cy'connect <n> <password>'%cw to connect.%cn
%ch%cwType %cy'create <n> <password>'%cw to create a new character.%cn
%ch%cwType %cy'quit'%cw to disconnect.%cn

888     888 8888888b.   .d8888b.        d8888 888b     d888 888     888 
888     888 888   Y88b d88P  Y88b      d88888 8888b   d8888 888     888 
888     888 888    888 Y88b.          d88P888 88888b.d88888 888     888 
888     888 888   d88P  "Y888b.      d88P 888 888Y88888P888 888     888 
888     888 8888888P"      "Y88b.   d88P  888 888 Y888P 888 888     888 
888     888 888 T88b         "888  d88P   888 888  Y8P  888 888     888 
Y88b. .d88P 888  T88b  Y88b  d88P d8888888888 888   "   888 Y88b. .d88P 
 "Y88888P"  888   T88b  "Y8888P" d88P     888 888       888  "Y88888P"  

>> Powered by UrsaMU. https://github.com/ursamu/ursamu
`;

    Deno.writeTextFileSync(join(targetDir, "src", "main.ts"), mainTs);
    Deno.writeTextFileSync(join(targetDir, "deno.json"), denoJson);
    Deno.writeTextFileSync(join(targetDir, "text", "default_connect.txt"), connectText);

    // telnet.ts
    Deno.writeTextFileSync(join(targetDir, "src", "telnet.ts"), 
      `import { startTelnetServer } from "ursamu";\nstartTelnetServer({ welcomeFile: "text/default_connect.txt" });`);


    console.log(fmt(`\n%ch%cg✨ Success! Project created in ${projectName}.%cn`));
    console.log(`\nTo start your game:`);
    console.log(fmt(`  %cycd ${projectName}%cn`));
    console.log(fmt(`  %cydeno task start%cn\n`));

  } catch (err) {
    console.error(fmt(`\n%crFatal Error during setup:%cn`), err);
    Deno.exit(1);
  }
}

const command = args._[0];
const restArgs = args._.slice(1).map(arg => String(arg));

// Handle commands
switch (command) {
  case "create": // Legacy alias
  case "init":
    await initProject();
    break;
    
  case "plugin":
    // Run the plugin command
    await runCommand("plugin.ts", restArgs);
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
  init                   Create a new UrsaMU project (Interactive)
  plugin <command>       Plugin management (install, init, list, remove)
  help                   Show this help message

Options:
  -h, --help             Show this help message
  -v, --version          Show version information

Examples:
  ursamu init
  ursamu plugin list
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