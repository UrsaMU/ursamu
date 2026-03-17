#!/usr/bin/env -S deno run -A
/**
 * src/cli/plugin.ts
 *
 * UrsaMU plugin manager.
 *
 * Commands:
 *   install <url>    Install a plugin from a GitHub URL
 *   update  <name>   Re-fetch a plugin from its original source
 *   remove  <name>   Uninstall a plugin
 *   list             List installed plugins
 *   info    <name>   Show manifest + registry details for a plugin
 */
import { parse } from "@std/flags";
import { join, basename, dirname, fromFileUrl } from "@std/path";
import { exists } from "@std/fs";
import type { PluginManifest, Registry, RegistryEntry } from "./types.ts";

const args = parse(Deno.args, {
  boolean: ["help", "force"],
  alias: { h: "help", f: "force" },
});

const command = String(args._[0] || "");
const subArgs  = args._.slice(1).map(String);

const PLUGINS_DIR   = join(dirname(dirname(fromFileUrl(import.meta.url))), "plugins");
const REGISTRY_PATH = join(PLUGINS_DIR, ".registry.json");

// ─── registry helpers ─────────────────────────────────────────────────────────

async function readRegistry(): Promise<Registry> {
  try {
    if (!await exists(REGISTRY_PATH)) return {};
    const raw = await Deno.readTextFile(REGISTRY_PATH);
    return JSON.parse(raw) as Registry;
  } catch {
    return {};
  }
}

async function writeRegistry(reg: Registry): Promise<void> {
  if (!await exists(PLUGINS_DIR)) {
    await Deno.mkdir(PLUGINS_DIR, { recursive: true });
  }
  await Deno.writeTextFile(REGISTRY_PATH, JSON.stringify(reg, null, 2));
}

function buildEntry(
  name: string,
  source: string,
  manifest: PluginManifest | null,
  existing?: RegistryEntry,
): RegistryEntry {
  const now = new Date().toISOString();
  return {
    name,
    version:     manifest?.version     ?? "unknown",
    description: manifest?.description ?? "",
    source,
    author:      manifest?.author      ?? "unknown",
    installedAt: existing?.installedAt ?? now,
    updatedAt:   now,
  };
}

// ─── manifest helpers ─────────────────────────────────────────────────────────

async function tryReadManifest(dir: string): Promise<PluginManifest | null> {
  const manifestPath = join(dir, "ursamu.plugin.json");
  try {
    if (!await exists(manifestPath)) return null;
    const raw = await Deno.readTextFile(manifestPath);
    const m = JSON.parse(raw) as Partial<PluginManifest>;

    // Warn about missing required fields but don't abort
    for (const field of ["name", "version", "description", "ursamu"] as const) {
      if (!m[field]) {
        console.warn(`  [warn] ursamu.plugin.json is missing field: "${field}"`);
      }
    }
    return m as PluginManifest;
  } catch (e) {
    console.warn(`  [warn] Could not parse ursamu.plugin.json: ${e instanceof Error ? e.message : e}`);
    return null;
  }
}

function printManifest(manifest: PluginManifest | null, url: string) {
  console.log("");
  console.log("  Plugin details");
  console.log("  ──────────────────────────────────────────");
  if (manifest) {
    console.log(`  Name        : ${manifest.name}`);
    console.log(`  Version     : ${manifest.version}`);
    console.log(`  Description : ${manifest.description}`);
    console.log(`  UrsaMU req. : ${manifest.ursamu}`);
    console.log(`  Author      : ${manifest.author      ?? "(unknown)"}`);
    console.log(`  License     : ${manifest.license     ?? "(unspecified)"}`);
    console.log(`  Entry file  : ${manifest.main        ?? "index.ts"}`);
  } else {
    console.log("  (No ursamu.plugin.json found — proceeding without manifest)");
  }
  console.log(`  Source      : ${url}`);
  console.log("  ──────────────────────────────────────────");
  console.log("");
}

// ─── clone + install core ─────────────────────────────────────────────────────

async function cloneAndInstall(
  url: string,
  nameOverride: string | null,
  existingEntry: RegistryEntry | undefined,
  skipConfirm: boolean,
): Promise<void> {
  const tempDir = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });

  try {
    // Clone
    const cloneProc = new Deno.Command("git", {
      args: ["clone", "--depth", "1", url, tempDir],
      stdout: "inherit",
      stderr: "inherit",
    });
    const cloneStatus = await cloneProc.spawn().status;
    if (!cloneStatus.success) {
      console.error("Failed to clone the repository.");
      Deno.exit(cloneStatus.code);
    }

    // Read manifest
    const manifest = await tryReadManifest(tempDir);
    const pluginName = nameOverride ?? manifest?.name ?? basename(url).replace(/\.git$/, "");

    // Display manifest
    printManifest(manifest, url);

    // Confirm (skip for update)
    if (!skipConfirm && !args.force) {
      const answer = prompt(`Install plugin "${pluginName}"? [y/N]: `);
      if (answer?.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    }

    // Validate entry file
    const entryFile = manifest?.main ?? "index.ts";
    if (!await exists(join(tempDir, entryFile))) {
      console.error(`Entry file "${entryFile}" not found in repository. Is this an UrsaMU plugin?`);
      Deno.exit(1);
    }

    // Strip .git
    const gitDir = join(tempDir, ".git");
    if (await exists(gitDir)) {
      await Deno.remove(gitDir, { recursive: true });
    }

    // Install
    const targetDir = join(PLUGINS_DIR, pluginName);
    if (await exists(targetDir)) {
      console.log(`  Replacing existing installation of "${pluginName}"...`);
      await Deno.remove(targetDir, { recursive: true });
    }
    if (!await exists(PLUGINS_DIR)) {
      await Deno.mkdir(PLUGINS_DIR, { recursive: true });
    }
    await Deno.rename(tempDir, targetDir);

    // Update registry
    const reg = await readRegistry();
    reg[pluginName] = buildEntry(pluginName, url, manifest, existingEntry);
    await writeRegistry(reg);

    console.log(`Successfully installed plugin: ${pluginName}  (v${reg[pluginName].version})`);
  } catch (err) {
    // Cleanup temp on error
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    throw err;
  }
}

// ─── commands ─────────────────────────────────────────────────────────────────

async function installPlugin(url: string): Promise<void> {
  if (!url) {
    console.error("Usage: ursamu plugin install <github-url>");
    Deno.exit(1);
  }
  console.log(`Fetching plugin from ${url} ...`);
  await cloneAndInstall(url, null, undefined, false);
}

async function updatePlugin(name: string): Promise<void> {
  if (!name) {
    console.error("Usage: ursamu plugin update <name>");
    Deno.exit(1);
  }

  const reg = await readRegistry();
  const entry = reg[name];
  if (!entry) {
    console.error(`Plugin "${name}" is not in the registry. Use "ursamu plugin install <url>" first.`);
    Deno.exit(1);
  }

  console.log(`Updating plugin "${name}" from ${entry.source} ...`);
  console.log(`  Current version: ${entry.version}`);
  await cloneAndInstall(entry.source, name, entry, true);
}

async function removePlugin(name: string): Promise<void> {
  if (!name) {
    console.error("Usage: ursamu plugin remove <name>");
    Deno.exit(1);
  }

  const targetDir = join(PLUGINS_DIR, name);
  if (!await exists(targetDir)) {
    console.error(`Plugin "${name}" is not installed.`);
    Deno.exit(1);
  }

  const answer = args.force ? "y" : prompt(`Remove plugin "${name}"? [y/N]: `);
  if (answer?.toLowerCase() !== "y") {
    console.log("Aborted.");
    return;
  }

  await Deno.remove(targetDir, { recursive: true });

  const reg = await readRegistry();
  if (reg[name]) {
    delete reg[name];
    await writeRegistry(reg);
  }

  console.log(`Removed plugin: ${name}`);
}

async function listPlugins(): Promise<void> {
  if (!await exists(PLUGINS_DIR)) {
    console.log("No plugins installed.");
    return;
  }

  const reg = await readRegistry();
  const entries: string[] = [];

  for await (const entry of Deno.readDir(PLUGINS_DIR)) {
    if (!entry.isDirectory) continue;
    const r = reg[entry.name];
    if (r) {
      const date = r.updatedAt.slice(0, 10);
      entries.push(`  ${entry.name.padEnd(24)} v${r.version.padEnd(10)} ${date}  ${r.source}`);
    } else {
      entries.push(`  ${entry.name.padEnd(24)} (unregistered)`);
    }
  }

  if (!entries.length) {
    console.log("No plugins installed.");
    return;
  }

  console.log("\nInstalled plugins:");
  console.log(`  ${"Name".padEnd(24)} ${"Version".padEnd(11)} ${"Updated".padEnd(12)} Source`);
  console.log("  " + "─".repeat(80));
  for (const line of entries) console.log(line);
  console.log("");
}

async function infoPlugin(name: string): Promise<void> {
  if (!name) {
    console.error("Usage: ursamu plugin info <name>");
    Deno.exit(1);
  }

  const reg = await readRegistry();
  const entry = reg[name];
  const installedDir = join(PLUGINS_DIR, name);

  if (!await exists(installedDir)) {
    console.error(`Plugin "${name}" is not installed.`);
    Deno.exit(1);
  }

  const manifest = await tryReadManifest(installedDir);

  console.log(`\nPlugin: ${name}`);
  console.log("─".repeat(48));

  if (entry) {
    console.log(`  Source      : ${entry.source}`);
    console.log(`  Installed   : ${entry.installedAt}`);
    console.log(`  Updated     : ${entry.updatedAt}`);
  } else {
    console.log("  (Not in registry — may have been installed manually)");
  }

  if (manifest) {
    console.log(`  Version     : ${manifest.version}`);
    console.log(`  Description : ${manifest.description}`);
    console.log(`  UrsaMU req. : ${manifest.ursamu}`);
    console.log(`  Author      : ${manifest.author   ?? "(unknown)"}`);
    console.log(`  License     : ${manifest.license  ?? "(unspecified)"}`);
    console.log(`  Entry file  : ${manifest.main     ?? "index.ts"}`);
  } else {
    console.log("  (No ursamu.plugin.json found in installed directory)");
  }
  console.log("");
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

if (args.help || !command) {
  showHelp();
  Deno.exit(0);
}

switch (command) {
  case "install":
    await installPlugin(subArgs[0]);
    break;
  case "update":
    await updatePlugin(subArgs[0]);
    break;
  case "remove":
    await removePlugin(subArgs[0]);
    break;
  case "list":
    await listPlugins();
    break;
  case "info":
    await infoPlugin(subArgs[0]);
    break;
  default:
    console.error(`Unknown plugin command: "${command}"`);
    showHelp();
    Deno.exit(1);
}

function showHelp() {
  console.log(`
UrsaMU Plugin Manager

Usage:
  ursamu plugin <command> [options]

Commands:
  install <url>    Install a plugin from a GitHub URL
  update  <name>   Re-fetch and update an installed plugin
  remove  <name>   Uninstall a plugin
  list             List all installed plugins
  info    <name>   Show manifest and registry details

Options:
  -f, --force      Skip confirmation prompts
  -h, --help       Show this help message

Plugin repos should include an ursamu.plugin.json at their root:
  {
    "name": "my-plugin",
    "version": "1.0.0",
    "description": "What it does",
    "ursamu": ">=1.0.0",
    "author": "Your Name",
    "license": "MIT"
  }
`);
}
