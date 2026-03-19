#!/usr/bin/env -S deno run -A

/**
 * @module ursamu-cli
 * @description The Command Line Interface for UrsaMU.
 *
 * Delegates to sub-scripts:
 *   create.ts  — project + in-tree plugin scaffolding
 *   plugin.ts  — plugin install / update / remove / list / info
 */
import { parse } from "jsr:@std/flags@^0.224.0";
import { join, dirname, fromFileUrl } from "jsr:@std/path@^0.224.0";
import parser from "../services/parser/parser.ts";

const fmt = (str: string) => parser.substitute("telnet", str);

const getRes = (text: string, defaultValue?: string) => {
  const promptText = defaultValue ? `${text} [${defaultValue}]: ` : `${text}: `;
  const val = prompt(promptText);
  if (val === null || val.trim() === "") return defaultValue || "";
  return val.trim();
};

const args = parse(Deno.args, {
  boolean: ["help", "version"],
  alias: { h: "help", v: "version" },
});

if (args.version) {
  console.log("UrsaMU CLI v1.0.0");
  Deno.exit(0);
}

if (args.help) {
  showHelp();
  Deno.exit(0);
}

// ─── interactive menu ─────────────────────────────────────────────────────────

if (args._.length === 0) {
  console.log(fmt(`
%ch%cc==================================================%cn
%ch%cw        Welcome to the %cyUrsaMU%cw CLI%cn
%ch%cc==================================================%cn
%cw
Select an action:
%cn`));

  console.log("1. Create a new UrsaMU Game Project");
  console.log("2. Scaffold a new in-tree Plugin");
  console.log("3. Create a standalone Plugin Project");
  console.log("4. Manage installed Plugins (install, update, list, remove)");
  console.log("5. Update ursamu engine to latest version");
  console.log("6. Exit");

  const choice = getRes("Selection", "1");

  switch (choice) {
    case "1": {
      const projectName = getRes("Project Name", "my-ursamu-game");
      const telnetPort  = getRes("Telnet Port",  "4201");
      const httpPort    = getRes("HTTP/WS Port", "4203");
      const gameName    = getRes("Game Name",    projectName);
      const gameDesc    = getRes("Description",  "A modern MU* game.");
      await runCommand("create.ts", [
        projectName,
        `--name=${projectName}`,
        `--telnet-port=${telnetPort}`,
        `--http-port=${httpPort}`,
        `--game-name=${gameName}`,
        `--game-desc=${gameDesc}`,
        "--non-interactive",
      ]);
      break;
    }
    case "2": {
      const name = getRes("Plugin Name");
      if (!name) { console.log("Aborted."); break; }
      await runCommand("create.ts", ["plugin", name, "--non-interactive"]);
      break;
    }
    case "3": {
      const name    = getRes("Plugin Name");
      const desc    = getRes("Description",  "A UrsaMU plugin");
      const version = getRes("Version",      "1.0.0");
      const author  = getRes("Author",       "");
      if (!name) { console.log("Aborted."); break; }
      await runCommand("create.ts", [
        "plugin", name, "--standalone", "--non-interactive",
        `--game-desc=${desc}`,
        `--telnet-port=${version}`,   // re-uses flag slot for version
        `--game-name=${author}`,      // re-uses flag slot for author
      ]);
      break;
    }
    case "4": {
      console.log("\nPlugin Management:");
      console.log("1. List installed plugins");
      console.log("2. Install a plugin from GitHub");
      console.log("3. Update an installed plugin");
      console.log("4. Remove a plugin");
      console.log("5. Show plugin info");

      const pChoice = getRes("Selection", "1");
      switch (pChoice) {
        case "1": await runCommand("plugin.ts", ["list"]); break;
        case "2": {
          const url = getRes("GitHub URL");
          if (url) await runCommand("plugin.ts", ["install", url]);
          break;
        }
        case "3": {
          const name = getRes("Plugin Name");
          if (name) await runCommand("plugin.ts", ["update", name]);
          break;
        }
        case "4": {
          const name = getRes("Plugin Name");
          if (name) await runCommand("plugin.ts", ["remove", name]);
          break;
        }
        case "5": {
          const name = getRes("Plugin Name");
          if (name) await runCommand("plugin.ts", ["info", name]);
          break;
        }
        default: console.log("Invalid selection.");
      }
      break;
    }
    case "5":
      await runCommand("update.ts", []);
      break;
    case "6":
      Deno.exit(0);
      break;
    default:
      console.log("Invalid selection.");
      Deno.exit(1);
  }

  Deno.exit(0);
}

// ─── command dispatch ─────────────────────────────────────────────────────────

const command  = args._[0];
const restArgs = args._.slice(1).map(String);

switch (command) {
  case "create":
  case "init":
    await runCommand("create.ts", restArgs);
    break;

  case "plugin":
    await runCommand("plugin.ts", restArgs);
    break;

  case "update":
    await runCommand("update.ts", restArgs);
    break;

  case "help":
    showHelp();
    break;

  default:
    console.error(`Unknown command: ${command}`);
    console.log("Run 'ursamu help' for usage information.");
    Deno.exit(1);
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
UrsaMU CLI

Usage:
  ursamu <command> [options]

Commands:
  create <name>                Create a new game project
  create plugin <name>         Scaffold an in-tree plugin
  create plugin <name> --standalone
                               Create a standalone publishable plugin project
  plugin install <url>         Install a plugin from GitHub
  plugin update  <name>        Update an installed plugin to the latest commit
  plugin remove  <name>        Uninstall a plugin
  plugin list                  List installed plugins
  plugin info    <name>        Show plugin manifest + registry details
  update                       Update ursamu engine to latest JSR version
  update --dry-run             Preview the update without writing changes
  help                         Show this help message

Options:
  -h, --help       Show this help message
  -v, --version    Show version information

Examples:
  ursamu create my-game
  ursamu create plugin my-feature
  ursamu create plugin my-feature --standalone
  ursamu plugin install https://github.com/user/my-plugin
  ursamu plugin update my-plugin
  ursamu plugin list
`);
}

async function runCommand(scriptName: string, scriptArgs: string[]) {
  // When run from JSR the URL is https://, not file:// — use URL-relative resolution.
  const scriptPath = import.meta.url.startsWith("file://")
    ? join(dirname(fromFileUrl(import.meta.url)), scriptName)
    : new URL(scriptName, import.meta.url).href;

  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", scriptPath, ...scriptArgs],
    stdin:  "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });

  const proc   = cmd.spawn();
  const status = await proc.status;
  if (!status.success) Deno.exit(status.code);
}
