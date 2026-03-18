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
const isLocal = currentSpecifier.startsWith(".") || currentSpecifier.startsWith("/");

// ── 2. resolve latest version (JSR) or local path ────────────────────────────

const SHELL_SCRIPTS = ["daemon.sh", "stop.sh", "restart.sh", "status.sh"];
const scriptsDir = join(cwd, "scripts");

let latestVersion: string | null = null;

if (isLocal) {
  console.log(`Local ursamu detected (${currentSpecifier}) — skipping version bump.`);
} else {
  const currentVersionMatch = currentSpecifier.match(/@(\d+\.\d+\.\d+)/);
  const currentVersion = currentVersionMatch ? currentVersionMatch[1] : null;

  console.log("Checking JSR for the latest @ursamu/ursamu release...");
  try {
    const res = await fetch("https://jsr.io/@ursamu/ursamu/meta.json");
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const meta = await res.json() as { latest: string };
    latestVersion = meta.latest;
  } catch (e) {
    console.error(`Error: Could not fetch version info from JSR — ${e}`);
    Deno.exit(1);
  }

  // ── 3. compare ─────────────────────────────────────────────────────────────

  if (currentVersion === latestVersion) {
    console.log(`Already up to date (${latestVersion}).`);
  } else {
    const newSpecifier = `jsr:@ursamu/ursamu@${latestVersion}`;
    console.log(`  Current : ${currentSpecifier}`);
    console.log(`  Latest  : ${newSpecifier}`);

    if (!dryRun) {
      // ── 4. update deno.json ───────────────────────────────────────────────
      imports[importKey] = newSpecifier;
      const updatedRaw = denoJsonRaw.replace(
        new RegExp(`"${currentSpecifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"`, "g"),
        `"${newSpecifier}"`
      );
      await Deno.writeTextFile(denoJsonPath, updatedRaw);
      console.log("Updated deno.json.");
      console.log(`\nUpdated @ursamu/ursamu ${currentVersion ?? "(unpinned)"} → ${latestVersion}`);
      if (currentVersion) {
        console.log(`Changelog: https://github.com/UrsaMU/ursamu/releases/tag/v${latestVersion}`);
      }
    } else {
      console.log("\nDry run — no files written.");
    }
  }
}

if (dryRun) Deno.exit(0);

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

// ── 6. sync shell scripts ─────────────────────────────────────────────────────
// These aren't accessible via the Deno import system so we copy/fetch them explicitly.

try {
  await Deno.mkdir(scriptsDir, { recursive: true });
  let synced = 0;

  for (const name of SHELL_SCRIPTS) {
    let content: string | null = null;

    if (isLocal) {
      // Copy from local ursamu path
      const localPath = join(cwd, currentSpecifier.replace(/\/$/, ""), "scripts", name);
      try {
        content = await Deno.readTextFile(localPath);
      } catch {
        console.warn(`  Warning: could not read ${localPath} — skipping.`);
        continue;
      }
    } else {
      // Fetch from JSR
      const url = `https://jsr.io/@ursamu/ursamu/${latestVersion}/scripts/${name}`;
      const res = await fetch(url);
      if (!res.ok) {
        console.warn(`  Warning: could not fetch scripts/${name} (${res.status}) — skipping.`);
        continue;
      }
      content = await res.text();
    }

    await Deno.writeTextFile(join(scriptsDir, name), content);
    try { await Deno.chmod(join(scriptsDir, name), 0o755); } catch { /* non-unix */ }
    synced++;
  }

  if (synced > 0) console.log(`Synced ${synced} shell script(s) in scripts/.`);
} catch (e) {
  console.warn(`Warning: could not sync shell scripts — ${e}`);
}
