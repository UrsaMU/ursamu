#!/usr/bin/env -S deno run -A
/**
 * src/cli/plugin.ts
 *
 * UrsaMU plugin manager.
 *
 * Commands:
 *   search  [query]          Search the hosted plugin registry
 *   install <url|name>       Install a plugin (URL or registry name)
 *   update  [name...]        Re-fetch one, several, or all plugins
 *   remove  <name>           Uninstall a plugin
 *   list                     List installed plugins
 *   info    <name>           Show manifest + registry details for a plugin
 *
 * Flags:
 *   --all                    (update) update every registered plugin
 *   --ref  <tag|sha>         (install) pin install to a specific tag or commit SHA
 *   --tag  <tag>             (search) filter by tag
 *   -f, --force              Skip confirmation prompts
 *   -h, --help               Show this help
 */
import { parse } from "jsr:@std/flags@^0.224.0";
import { join, basename } from "jsr:@std/path@^0.224.0";
import { exists } from "jsr:@std/fs@^0.224.0";
import type { PluginManifest, Registry, RegistryEntry, RemoteRegistry, RemotePluginEntry } from "./types.ts";
import { buildCloneSteps } from "../utils/ensurePlugins.ts";

const args = parse(Deno.args, {
  boolean: ["help", "force", "all"],
  string:  ["tag", "ref"],
  alias:   { h: "help", f: "force", a: "all", t: "tag", r: "ref" },
});

const command = String(args._[0] || "");
const subArgs  = args._.slice(1).map(String);

// Resolve relative to the user's working directory — works with local,
// global, and JSR installs.
const PLUGINS_DIR   = join(Deno.cwd(), "src", "plugins");
const REGISTRY_PATH = join(PLUGINS_DIR, ".registry.json");

// The hosted community registry. Override with URSAMU_REGISTRY_URL for
// testing or private registries.
const REMOTE_REGISTRY_URL =
  Deno.env.get("URSAMU_REGISTRY_URL") ??
  "https://raw.githubusercontent.com/UrsaMU/plugin-registry/main/registry.json";

// ─── local registry helpers ───────────────────────────────────────────────────

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

// ─── remote registry helpers ──────────────────────────────────────────────────

async function fetchRemoteRegistry(): Promise<RemoteRegistry> {
  const res = await fetch(REMOTE_REGISTRY_URL);
  if (!res.ok) {
    throw new Error(`Registry returned HTTP ${res.status}: ${REMOTE_REGISTRY_URL}`);
  }
  return await res.json() as RemoteRegistry;
}

/** Look up a plugin by name in the remote registry. */
async function resolveRemotePlugin(name: string): Promise<RemotePluginEntry | null> {
  const remote = await fetchRemoteRegistry();
  return remote.plugins.find(p => p.name === name) ?? null;
}

// ─── manifest helpers ─────────────────────────────────────────────────────────

async function tryReadManifest(dir: string): Promise<PluginManifest | null> {
  const manifestPath = join(dir, "ursamu.plugin.json");
  try {
    if (!await exists(manifestPath)) return null;
    const raw = await Deno.readTextFile(manifestPath);
    const m = JSON.parse(raw) as Partial<PluginManifest>;
    for (const field of ["name", "version", "description", "ursamu"] as const) {
      if (!m[field]) console.warn(`  [warn] ursamu.plugin.json is missing field: "${field}"`);
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
    console.log(`  Tags        : ${manifest.tags?.join(", ") ?? "(none)"}`);
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
  ref?: string,
): Promise<void> {
  const tempDir = await Deno.makeTempDir({ prefix: "ursamu-plugin-" });

  try {
    const steps = buildCloneSteps(url, tempDir, ref);
    for (const stepArgs of steps) {
      const proc = new Deno.Command("git", {
        args: stepArgs,
        stdout: "inherit",
        stderr: "inherit",
      });
      const status = await proc.spawn().status;
      if (!status.success) {
        throw new Error(`git ${stepArgs[0]} exited with code ${status.code}`);
      }
    }

    const manifest = await tryReadManifest(tempDir);
    const pluginName = nameOverride ?? manifest?.name ?? basename(url).replace(/\.git$/, "");

    printManifest(manifest, url);

    if (!skipConfirm && !args.force) {
      const answer = prompt(`Install plugin "${pluginName}"? [y/N]: `);
      if (answer?.toLowerCase() !== "y") {
        console.log("Aborted.");
        return;
      }
    }

    const entryFile = manifest?.main ?? "index.ts";
    if (!await exists(join(tempDir, entryFile))) {
      console.error(`Entry file "${entryFile}" not found in repository. Is this an UrsaMU plugin?`);
      Deno.exit(1);
    }

    const gitDir = join(tempDir, ".git");
    if (await exists(gitDir)) await Deno.remove(gitDir, { recursive: true });

    const targetDir = join(PLUGINS_DIR, pluginName);
    if (await exists(targetDir)) {
      console.log(`  Replacing existing installation of "${pluginName}"...`);
      await Deno.remove(targetDir, { recursive: true });
    }
    if (!await exists(PLUGINS_DIR)) await Deno.mkdir(PLUGINS_DIR, { recursive: true });
    await Deno.rename(tempDir, targetDir);

    const reg = await readRegistry();
    reg[pluginName] = buildEntry(pluginName, url, manifest, existingEntry);
    await writeRegistry(reg);

    console.log(`Successfully installed plugin: ${pluginName}  (v${reg[pluginName].version})`);
  } catch (err) {
    await Deno.remove(tempDir, { recursive: true }).catch(() => {});
    throw err;
  }
}

// ─── commands ─────────────────────────────────────────────────────────────────

/**
 * `ursamu plugin search [query] [--tag <tag>]`
 *
 * Fetches the hosted registry and prints matching plugins.
 * Marks already-installed plugins with their local version.
 */
async function searchPlugins(query: string, tag: string | null): Promise<void> {
  console.log("Fetching plugin registry...");
  let remote: RemoteRegistry;
  try {
    remote = await fetchRemoteRegistry();
  } catch (e) {
    console.error(`Could not reach plugin registry: ${e instanceof Error ? e.message : e}`);
    console.error(`Registry URL: ${REMOTE_REGISTRY_URL}`);
    Deno.exit(1);
  }

  let results = remote.plugins;

  if (tag) {
    const t = tag.toLowerCase();
    results = results.filter(p => p.tags?.some(pt => pt.toLowerCase() === t));
  }

  if (query) {
    const q = query.toLowerCase();
    results = results.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.tags?.some(t => t.toLowerCase().includes(q))
    );
  }

  if (results.length === 0) {
    console.log("No plugins found matching your query.");
    return;
  }

  const reg = await readRegistry();

  console.log(`\nFound ${results.length} plugin${results.length !== 1 ? "s" : ""}:\n`);
  for (const p of results) {
    const installed = reg[p.name];
    const badge = installed
      ? `  [installed v${installed.version}]`
      : installed === undefined && await exists(join(PLUGINS_DIR, p.name))
        ? "  [installed — unregistered]"
        : "";
    console.log(`  ${p.name}${badge}`);
    console.log(`    ${p.description}`);
    if (p.tags?.length) console.log(`    tags: ${p.tags.join(", ")}`);
    console.log(`    author: ${p.author}   requires: ursamu ${p.ursamu}`);
    console.log(`    url: ${p.url}`);
    console.log("");
  }
  console.log(`To install: ursamu plugin install <name>`);
}

/**
 * `ursamu plugin install <url|name>`
 *
 * If the argument is a URL (starts with http/https or ends with .git), clone
 * it directly.  Otherwise look the name up in the hosted registry and resolve
 * it to a URL automatically.
 */
async function installPlugin(nameOrUrl: string): Promise<void> {
  if (!nameOrUrl) {
    console.error("Usage: ursamu plugin install <github-url|registry-name>");
    Deno.exit(1);
  }

  let url = nameOrUrl;

  const looksLikeUrl =
    nameOrUrl.startsWith("http://") ||
    nameOrUrl.startsWith("https://") ||
    nameOrUrl.endsWith(".git");

  if (!looksLikeUrl) {
    console.log(`Resolving "${nameOrUrl}" from plugin registry...`);
    let entry: RemotePluginEntry | null;
    try {
      entry = await resolveRemotePlugin(nameOrUrl);
    } catch (e) {
      console.error(`Could not reach plugin registry: ${e instanceof Error ? e.message : e}`);
      Deno.exit(1);
    }
    if (!entry) {
      console.error(
        `Plugin "${nameOrUrl}" was not found in the registry.\n` +
        `Use a full GitHub URL to install unlisted plugins:\n` +
        `  ursamu plugin install https://github.com/owner/repo`
      );
      Deno.exit(1);
    }
    url = entry.url;
    console.log(`  Resolved to: ${url}`);
  }

  console.log(`Fetching plugin from ${url}${args.ref ? `@${args.ref}` : ""} ...`);
  try {
    await cloneAndInstall(url, null, undefined, false, args.ref);
  } catch (err) {
    console.error(`Failed to install plugin: ${err instanceof Error ? err.message : err}`);
    Deno.exit(1);
  }
}

/**
 * `ursamu plugin update [name...] [--all]`
 *
 * - No arguments + no --all → print usage
 * - `--all`                 → update every registered plugin
 * - `<name>`                → update one named plugin
 * - `<name1> <name2> ...`   → update several named plugins
 *
 * On partial failures the command continues and prints a summary.
 */
async function updatePlugin(names: string[]): Promise<void> {
  const updateAll = Boolean(args.all);

  if (!updateAll && names.length === 0) {
    console.error(
      "Usage: ursamu plugin update <name> [name...]\n" +
      "       ursamu plugin update --all"
    );
    Deno.exit(1);
  }

  const reg = await readRegistry();
  const toUpdate = updateAll ? Object.keys(reg) : names;

  if (toUpdate.length === 0) {
    console.log("Nothing to update.");
    return;
  }

  let ok = 0, failed = 0, skipped = 0;

  for (const name of toUpdate) {
    const entry = reg[name];
    if (!entry) {
      console.error(`  [skip] "${name}" is not in the registry.`);
      skipped++;
      continue;
    }
    console.log(`\nUpdating "${name}"  (${entry.version} → latest)  from ${entry.source} ...`);
    try {
      await cloneAndInstall(entry.source, name, entry, true);
      ok++;
    } catch (e) {
      console.error(`  [error] Failed to update "${name}": ${e instanceof Error ? e.message : e}`);
      failed++;
    }
  }

  if (toUpdate.length > 1) {
    const parts = [`\nUpdate complete:`];
    if (ok)      parts.push(`${ok} updated`);
    if (failed)  parts.push(`${failed} failed`);
    if (skipped) parts.push(`${skipped} skipped`);
    console.log(parts.join("  "));
  }

  if (failed > 0 || skipped > 0) Deno.exit(1);
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
  if (answer?.toLowerCase() !== "y") { console.log("Aborted."); return; }

  await Deno.remove(targetDir, { recursive: true });

  const reg = await readRegistry();
  if (reg[name]) { delete reg[name]; await writeRegistry(reg); }

  console.log(`Removed plugin: ${name}`);
}

async function listPlugins(): Promise<void> {
  if (!await exists(PLUGINS_DIR)) { console.log("No plugins installed."); return; }

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

  if (!entries.length) { console.log("No plugins installed."); return; }

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
    console.log(`  Tags        : ${manifest.tags?.join(", ") ?? "(none)"}`);
    console.log(`  Entry file  : ${manifest.main     ?? "index.ts"}`);
  } else {
    console.log("  (No ursamu.plugin.json found in installed directory)");
  }
  console.log("");
}

// ─── help ─────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
UrsaMU Plugin Manager

Usage:
  ursamu plugin <command> [options]

Commands:
  search  [query]          Search the hosted plugin registry (supports --tag)
  install <url|name>       Install from a GitHub URL or by registry name
  update  [name...]        Update one or more plugins
  update  --all            Update every registered plugin
  remove  <name>           Uninstall a plugin
  list                     List all installed plugins
  info    <name>           Show manifest and registry details

Options:
  --all                    (update) re-fetch all registered plugins
  --ref  <tag|sha>         (install) pin to a tag (v1.1.0) or commit SHA
  --tag  <tag>             (search) filter results by tag
  -f, --force              Skip confirmation prompts
  -h, --help               Show this help message

Examples:
  ursamu plugin search                     # list everything in the registry
  ursamu plugin search ai                  # search by keyword
  ursamu plugin search --tag chargen       # filter by tag
  ursamu plugin install ursamu-ai-gm       # install by name (registry resolves URL)
  ursamu plugin install https://github.com/owner/repo             # install by URL
  ursamu plugin install --ref v1.1.0 https://github.com/owner/repo  # pin to tag
  ursamu plugin install --ref a3f7c12 https://github.com/owner/repo # pin to SHA
  ursamu plugin update my-plugin           # update one plugin
  ursamu plugin update my-plugin other-plugin           # update several
  ursamu plugin update --all               # update everything registered

Plugin repos should include an ursamu.plugin.json at their root:
  {
    "name":        "my-plugin",
    "version":     "1.0.0",
    "description": "What it does",
    "ursamu":      ">=1.5.0",
    "author":      "Your Name",
    "license":     "MIT",
    "tags":        ["chargen", "vtm"]
  }
`);
}

// ─── dispatch ─────────────────────────────────────────────────────────────────

if (args.help || !command) {
  showHelp();
  Deno.exit(0);
}

switch (command) {
  case "search":
    await searchPlugins(subArgs[0] ?? "", args.tag ?? null);
    break;
  case "install":
    await installPlugin(subArgs[0]);
    break;
  case "update":
    await updatePlugin(subArgs);
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
