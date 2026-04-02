#!/usr/bin/env -S deno run -A

/**
 * @module ursamu-scripts
 * @description Manage the operational shell scripts in a UrsaMU game project's
 * scripts/ directory (daemon.sh, run.sh, stop.sh, etc.).
 *
 * These scripts are copied once at project creation and can drift out of date
 * as the engine evolves. Use this command to refresh specific scripts by name —
 * overwriting an existing local copy always requires explicit confirmation.
 *
 * Commands:
 *   list             — Show available engine scripts and which have local copies.
 *   update <name>    — Pull a named script from the engine. Prompts before
 *                      overwriting an existing local file. Accepts multiple names.
 *
 * Usage:
 *   ursamu scripts list
 *   ursamu scripts update run.sh
 *   ursamu scripts update daemon.sh stop.sh restart.sh
 *   ursamu scripts update run.sh --dry-run
 */

import { parse } from "jsr:@std/flags@^0.224.0";
import { join } from "jsr:@std/path@^0.224.0";
import { fromFileUrl } from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";
import { bold, cyan, dim, green, red, yellow } from "jsr:@std/fmt@^0.224.0/colors";

// ── CLI args ──────────────────────────────────────────────────────────────────

const args = parse(Deno.args, {
  boolean: ["help", "dry-run"],
  alias:   { h: "help" },
});

if (args.help || args._.length === 0) {
  showHelp();
  Deno.exit(0);
}

const subcommand = String(args._[0]);
const names      = args._.slice(1).map(String);
const dryRun     = args["dry-run"] as boolean;

// ── Engine script source ──────────────────────────────────────────────────────

// scripts/ sits 2 dirs above src/cli/ in both local and JSR layouts.
const ENGINE_SCRIPTS_BASE = new URL("../../scripts/", import.meta.url);

/**
 * Engine scripts intended for game projects.
 * Dev-only utilities (create-plugin.sh, setup-config.sh, migration scripts)
 * are excluded — they have no use in a running game.
 */
const GAME_SCRIPTS = [
  "daemon.sh",
  "main-loop.sh",
  "restart.sh",
  "run.sh",
  "status.sh",
  "stop.sh",
  "ursamu.sh",
];

/** Fetch a script from the engine package. Returns null if not found. */
async function fetchEngineScript(name: string): Promise<string | null> {
  const url = new URL(name, ENGINE_SCRIPTS_BASE);
  try {
    if (url.protocol === "file:") {
      return await Deno.readTextFile(fromFileUrl(url));
    }
    const res = await fetch(url.toString());
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const localScriptsDir = join(Deno.cwd(), "scripts");

function localPath(name: string): string {
  return join(localScriptsDir, name);
}

function hasLocalCopy(name: string): boolean {
  return existsSync(localPath(name));
}

async function confirm(question: string): Promise<boolean> {
  const buf = new Uint8Array(4);
  await Deno.stdout.write(new TextEncoder().encode(`${question} ${dim("[y/N]")} `));
  const n = await Deno.stdin.read(buf);
  const answer = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim().toLowerCase();
  return answer === "y";
}

// ── Commands ──────────────────────────────────────────────────────────────────

async function cmdList() {
  console.log(`\n${bold("Game shell scripts")}  (${GAME_SCRIPTS.length} available)\n`);
  console.log(dim("  Name".padEnd(22)) + dim("Local copy"));
  console.log(dim("  " + "─".repeat(40)));

  for (const name of GAME_SCRIPTS) {
    const local  = hasLocalCopy(name);
    const marker = local ? cyan("  present") : yellow("  missing");
    console.log(`  ${bold(name.padEnd(20))}${marker}`);
  }

  const missing = GAME_SCRIPTS.filter(n => !hasLocalCopy(n));
  if (missing.length) {
    console.log(`\n  ${missing.length} missing.  Run ${bold(`ursamu scripts update ${missing[0]}`)} to add.`);
  } else {
    console.log(`\n  All scripts present.  Use ${bold("ursamu scripts update <name>")} to refresh one.`);
  }
  console.log();
}

async function cmdUpdate(scriptNames: string[]) {
  if (scriptNames.length === 0) {
    console.error("Error: specify at least one script name.");
    console.error("  Example: ursamu scripts update run.sh");
    console.error("  Run 'ursamu scripts list' to see available scripts.");
    Deno.exit(1);
  }

  const available = new Set(GAME_SCRIPTS);
  let updated = 0;
  let skipped = 0;

  for (const name of scriptNames) {
    if (!available.has(name)) {
      console.error(`${red("✗")} ${bold(name)} is not a known game script. Run 'ursamu scripts list' to see valid names.`);
      skipped++;
      continue;
    }

    const isPresent = hasLocalCopy(name);

    if (dryRun) {
      const tag = isPresent ? cyan("would overwrite") : green("would add");
      console.log(`  ${bold(name.padEnd(22))}  ${tag}`);
      continue;
    }

    if (isPresent) {
      console.log(`\n  ${bold(cyan(name))} already exists at:`);
      console.log(`    ${dim(localPath(name))}`);
      const ok = await confirm(`  Overwrite with the engine version?`);
      if (!ok) {
        console.log(`  ${dim("Skipped.")}`);
        skipped++;
        continue;
      }
    }

    const content = await fetchEngineScript(name);
    if (content === null) {
      console.error(`${red("✗")} Could not fetch ${bold(name)} from the engine package.`);
      skipped++;
      continue;
    }

    await Deno.mkdir(localScriptsDir, { recursive: true });
    await Deno.writeTextFile(localPath(name), content);
    try { await Deno.chmod(localPath(name), 0o755); } catch { /* non-unix */ }

    const tag = isPresent ? "Updated" : "Added";
    console.log(`${green("✓")} ${tag} ${bold(name)}`);
    updated++;
  }

  if (dryRun) {
    console.log(`\n${dim("Dry run — no files written.")}`);
    return;
  }

  console.log();
  if (updated > 0) console.log(`${green("✓")} ${updated} script(s) updated.`);
  if (skipped > 0) console.log(dim(`  ${skipped} skipped.`));
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

switch (subcommand) {
  case "list":
    await cmdList();
    break;

  case "update":
  case "sync":
    await cmdUpdate(names);
    break;

  default:
    console.error(`Unknown subcommand: ${subcommand}`);
    console.error("Run 'ursamu scripts --help' for usage.");
    Deno.exit(1);
}

// ── Help ──────────────────────────────────────────────────────────────────────

function showHelp() {
  console.log(`
UrsaMU Scripts — manage game shell scripts in your project's scripts/ directory

Usage:
  ursamu scripts list                      List all game scripts (shows which are present)
  ursamu scripts update <name...>          Pull named script(s) from the engine
  ursamu scripts update <name> --dry-run   Preview without writing

Available scripts:
  ${GAME_SCRIPTS.join(", ")}

Options:
  --dry-run    Show what would change without writing anything
  -h, --help   Show this help message

Notes:
  Scripts in scripts/ are copied once at project creation. Use 'update' to
  refresh them from the current engine version — each existing file requires
  explicit confirmation before being overwritten.

Examples:
  ursamu scripts list
  ursamu scripts update run.sh
  ursamu scripts update daemon.sh stop.sh restart.sh
  ursamu scripts update run.sh --dry-run
`);
}
