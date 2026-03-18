#!/usr/bin/env -S deno run -A

/**
 * @module ursamu-update
 * @description Updates the ursamu engine dependency in a game project's deno.json
 * to the latest version published on JSR, then re-caches entry-point files.
 */

import { parse } from "@std/flags";
import { join } from "@std/path";
import { existsSync } from "@std/fs";

const args = parse(Deno.args, {
  boolean: ["help", "dry-run"],
  alias: { h: "help" },
});

if (args.help) {
  console.log(`
UrsaMU Update

Usage:
  ursamu update [options]

Options:
  --dry-run    Show what would change without writing anything
  -h, --help   Show this help message

Run from your game project root. Updates the jsr:@ursamu/ursamu import in
deno.json to the latest published version and re-caches entry-point files.
`);
  Deno.exit(0);
}

const dryRun = args["dry-run"] as boolean;
const cwd = Deno.cwd();
const denoJsonPath = join(cwd, "deno.json");

// ── 1. locate deno.json ───────────────────────────────────────────────────────

if (!existsSync(denoJsonPath)) {
  console.error("Error: No deno.json found in the current directory.");
  console.error("Run this command from your game project root.");
  Deno.exit(1);
}

let denoJsonRaw: string;
let denoJson: Record<string, unknown>;
try {
  denoJsonRaw = await Deno.readTextFile(denoJsonPath);
  denoJson = JSON.parse(denoJsonRaw);
} catch {
  console.error("Error: Could not parse deno.json.");
  Deno.exit(1);
}

const imports = denoJson.imports as Record<string, string> | undefined;
if (!imports) {
  console.error("Error: deno.json has no 'imports' field — is this a UrsaMU game project?");
  Deno.exit(1);
}

// Accept any of: "jsr:@ursamu/ursamu", "jsr:@ursamu/ursamu@x.y.z", "jsr:@ursamu/ursamu@^x.y.z"
const URSAMU_RE = /^jsr:@ursamu\/ursamu(@[^\s]*)?$/;
const importKey = Object.keys(imports).find((k) => k === "ursamu" || k === "@ursamu/ursamu");

if (!importKey || !URSAMU_RE.test(imports[importKey])) {
  console.error("Error: No ursamu import found in deno.json imports.");
  console.error(`Expected a key "ursamu" or "@ursamu/ursamu" pointing to jsr:@ursamu/ursamu`);
  Deno.exit(1);
}

const currentSpecifier = imports[importKey];
const currentVersionMatch = currentSpecifier.match(/@(\d+\.\d+\.\d+)/);
const currentVersion = currentVersionMatch ? currentVersionMatch[1] : null;

// ── 2. fetch latest version from JSR ─────────────────────────────────────────

console.log("Checking JSR for the latest @ursamu/ursamu release...");

let latestVersion: string;
try {
  const res = await fetch("https://jsr.io/@ursamu/ursamu/meta.json");
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const meta = await res.json() as { latest: string };
  latestVersion = meta.latest;
} catch (e) {
  console.error(`Error: Could not fetch version info from JSR — ${e}`);
  Deno.exit(1);
}

// ── 3. compare ───────────────────────────────────────────────────────────────

if (currentVersion === latestVersion) {
  console.log(`Already up to date (${latestVersion}).`);
  Deno.exit(0);
}

const newSpecifier = `jsr:@ursamu/ursamu@${latestVersion}`;

console.log(`  Current : ${currentSpecifier}`);
console.log(`  Latest  : ${newSpecifier}`);

if (dryRun) {
  console.log("\nDry run — no files written.");
  Deno.exit(0);
}

// ── 4. update deno.json ───────────────────────────────────────────────────────

imports[importKey] = newSpecifier;

// Preserve original formatting by doing a simple string replace
const updatedRaw = denoJsonRaw.replace(
  new RegExp(`"${currentSpecifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"),
  `"${newSpecifier}"`
);

await Deno.writeTextFile(denoJsonPath, updatedRaw);
console.log("\nUpdated deno.json.");

// ── 5. re-cache entry points ──────────────────────────────────────────────────

const entryPoints: string[] = [];
for (const candidate of ["src/main.ts", "src/telnet.ts", "main.ts"]) {
  if (existsSync(join(cwd, candidate))) entryPoints.push(candidate);
}

if (entryPoints.length > 0) {
  console.log(`Re-caching: ${entryPoints.join(", ")} ...`);
  const cmd = new Deno.Command(Deno.execPath(), {
    args: ["cache", "--reload", ...entryPoints],
    cwd,
    stdin:  "inherit",
    stdout: "inherit",
    stderr: "inherit",
  });
  const status = await cmd.spawn().status;
  if (!status.success) {
    console.warn("Warning: deno cache returned a non-zero exit code.");
  }
}

console.log(`\nUpdated @ursamu/ursamu ${currentVersion ?? "(unpinned)"} → ${latestVersion}`);
if (currentVersion) {
  console.log(`Changelog: https://github.com/UrsaMU/ursamu/releases/tag/v${latestVersion}`);
}
