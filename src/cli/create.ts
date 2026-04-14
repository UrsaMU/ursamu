#!/usr/bin/env -S deno run -A

import { parse } from "jsr:@std/flags@^0.224.0";
import { join, dirname, fromFileUrl, relative } from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";
import { scaffoldPlugin } from "./create-plugin.ts";
import { scaffoldProject } from "./create-project.ts";

const __dirname = import.meta.url.startsWith("file://")
  ? dirname(fromFileUrl(import.meta.url))
  : Deno.cwd();
const currentDir = Deno.cwd();

const args = parse(Deno.args, {
  boolean: ["help", "standalone", "non-interactive", "local"],
  string: ["name", "telnet-port", "http-port", "game-name", "game-desc"],
  alias: { h: "help", l: "local" },
});

if (args.help || args._.length === 0) {
  console.log(`
UrsaMU Project Creator

Usage:
  ursamu create <project-name>          Create a new game project
  ursamu create <project-name> --local  Scaffold a test game linked to the local engine checkout
  ursamu create plugin <plugin-name>    Scaffold a new plugin

Options:
  -h, --help    Show this help message
  -l, --local   Link imports to the local engine source (for engine development)

Examples:
  ursamu create my-game
  ursamu create my-test-game --local
  ursamu create plugin my-feature
  `);
  Deno.exit(0);
}

// ── plugin scaffold ────────────────────────────────────────────────────────────
if (args._[0]?.toString() === "plugin") {
  let pluginName = args._[1]?.toString() ?? args["name"] ?? "";

  if (!pluginName) {
    if (args["non-interactive"]) {
      console.error("Error: plugin name is required.\nUsage: ursamu create plugin <plugin-name>");
      Deno.exit(1);
    }
    pluginName = prompt("Plugin name: ")?.trim() ?? "";
    if (!pluginName) { console.error("Aborted — no name provided."); Deno.exit(1); }
  }

  await scaffoldPlugin(pluginName, {
    standalone:     Boolean(args["standalone"]),
    nonInteractive: Boolean(args["non-interactive"]),
    desc:           args["game-desc"],
    version:        args["telnet-port"],  // reused flag (legacy)
    author:         undefined,
    currentDir,
  });
  Deno.exit(0);
}

// ── game project scaffold ──────────────────────────────────────────────────────
const projectName = args._[0].toString();
const targetDir   = join(currentDir, projectName);
const isLocal     = Boolean(args["local"]);

if (existsSync(targetDir)) {
  console.error(`Error: Directory already exists at ${targetDir}`);
  Deno.exit(1);
}

let engineRelPath = "..";
if (isLocal) {
  // src/cli/create.ts → src/cli → src → engine root (3 levels up)
  const engineRoot = import.meta.url.startsWith("file://")
    ? dirname(dirname(dirname(fromFileUrl(import.meta.url))))
    : currentDir;
  engineRelPath = relative(targetDir, engineRoot) || ".";
}

await scaffoldProject(projectName, { isLocal, engineRelPath, targetDir });
