#!/usr/bin/env -S deno run -A

/**
 * @module ursamu-update
 * @description Updates the ursamu engine dependency in a game project's deno.json
 * to the latest version published on JSR, then re-caches entry-point files.
 */

import { parse } from "jsr:@std/flags@^0.224.0";
import { join } from "jsr:@std/path@^0.224.0";
import { existsSync } from "jsr:@std/fs@^0.224.0";
import { bold, cyan, dim, green, red, yellow } from "jsr:@std/fmt@^0.224.0/colors";
import { GAME_PROJECT_TASKS, DEFAULT_PLUGINS_MANIFEST } from "./game-project-tasks.ts";

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

let denoJson: Record<string, unknown>;
try {
  denoJson = JSON.parse(await Deno.readTextFile(denoJsonPath));
} catch {
  console.error("Error: Could not parse deno.json.");
  Deno.exit(1);
}

const imports = denoJson.imports as Record<string, string> | undefined;
if (!imports) {
  console.error("Error: deno.json has no 'imports' field — is this a UrsaMU game project?");
  Deno.exit(1);
}

// Accept any of: "jsr:@ursamu/ursamu", "jsr:@ursamu/ursamu@x.y.z", local paths (../ursamu/mod.ts)
const URSAMU_RE = /^jsr:@ursamu\/ursamu(@[^\s]*)?$/;
const importKey = Object.keys(imports).find((k) => k === "ursamu" || k === "@ursamu/ursamu");

if (!importKey) {
  console.error("Error: No ursamu import found in deno.json imports.");
  console.error(`Expected a key "ursamu" or "@ursamu/ursamu" pointing to jsr:@ursamu/ursamu`);
  Deno.exit(1);
}

const currentSpecifier = imports[importKey];
const isLocal = currentSpecifier.startsWith(".") || currentSpecifier.startsWith("/");

if (!isLocal && !URSAMU_RE.test(currentSpecifier)) {
  console.error("Error: No ursamu import found in deno.json imports.");
  console.error(`Expected a key "ursamu" or "@ursamu/ursamu" pointing to jsr:@ursamu/ursamu`);
  Deno.exit(1);
}

// ── 2. resolve latest version (JSR) or local path ────────────────────────────

const SHELL_SCRIPTS = ["daemon.sh", "main-loop.sh", "run.sh", "stop.sh", "restart.sh", "status.sh"];
const scriptsDir = join(cwd, "scripts");

let latestVersion: string | null = null;
let denoJsonDirty = false;

// Game-project tasks are always sourced from the bundled constant — not from
// the engine's own deno.json (which contains engine-dev tasks, not game tasks).
const upstreamTasks: Record<string, string> = GAME_PROJECT_TASKS;

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
    console.log(`  ${currentSpecifier} → ${newSpecifier}`);
    imports[importKey] = newSpecifier;
    // Keep @ursamu/ursamu in sync — plugins import this specifier directly,
    // and a version mismatch means two separate module instances with separate
    // cmds/cmdParser state, causing addCmd registrations to be invisible.
    if (importKey !== "@ursamu/ursamu" && "@ursamu/ursamu" in imports) {
      imports["@ursamu/ursamu"] = newSpecifier;
    }
    denoJsonDirty = true;
  }
}

// ── 4b. ensure plugin-required import mappings are present ────────────────────
// Plugins use bare specifiers like "@ursamu/ursamu" and "@std/path" that must
// be resolvable from the game project's import map.
const REQUIRED_IMPORTS: Record<string, string> = {
  // Must match the ursamu version exactly — different versions = different module
  // instances = plugins' addCmd calls land on a separate cmds array.
  "@ursamu/ursamu": imports[importKey] ?? "jsr:@ursamu/ursamu",
  "@std/path":      "jsr:@std/path@^0.224.0",
  "@std/assert":    "jsr:@std/assert@^0.224.0",
  "@std/fs":        "jsr:@std/fs@^0.224.0",
};
for (const [key, val] of Object.entries(REQUIRED_IMPORTS)) {
  if (!imports[key]) {
    imports[key] = val;
    denoJsonDirty = true;
    console.log(`  ${green("✓")} Added import mapping: ${bold(key)}`);
  }
}

// Always keep @ursamu/ursamu in sync with ursamu regardless of whether a
// version bump happened — catches stale values left by older update runs.
const ursamuSpecifier = imports[importKey];
if (ursamuSpecifier && imports["@ursamu/ursamu"] && imports["@ursamu/ursamu"] !== ursamuSpecifier) {
  imports["@ursamu/ursamu"] = ursamuSpecifier;
  denoJsonDirty = true;
  console.log(`  ${green("✓")} Synced @ursamu/ursamu → ${bold(ursamuSpecifier)}`);
}

// ── 5. merge tasks ────────────────────────────────────────────────────────────

if (upstreamTasks) {
  const currentTasks = (denoJson.tasks as Record<string, string> | undefined) ?? {};
  const added: string[] = [];
  const changed: string[] = [];

  // Collect changes first, then decide what to apply
  const toAdd: [string, string][] = [];
  const toChange: [string, string][] = [];

  for (const [key, val] of Object.entries(upstreamTasks)) {
    if (currentTasks[key] === val) continue;
    if (key in currentTasks) toChange.push([key, val]);
    else toAdd.push([key, val]);
  }

  // Always apply new tasks
  for (const [key, val] of toAdd) {
    currentTasks[key] = val;
    added.push(key);
    denoJsonDirty = true;
  }

  // Prompt before overwriting existing tasks
  if (toChange.length && !dryRun) {
    console.log();
    console.log(yellow(bold("  Tasks differ from upstream:")));
    console.log(dim("  " + "─".repeat(56)));
    for (const [key, val] of toChange) {
      console.log(`  ${bold(cyan(key))}`);
      console.log(`    ${dim("current ")}  ${red(currentTasks[key])}`);
      console.log(`    ${dim("upstream")}  ${green(val)}`);
    }
    console.log(dim("  " + "─".repeat(56)));
    const buf = new Uint8Array(4);
    await Deno.stdout.write(new TextEncoder().encode(`\n  Overwrite with upstream? ${dim("[y/N]")} `));
    const n = await Deno.stdin.read(buf);
    const answer = new TextDecoder().decode(buf.subarray(0, n ?? 0)).trim().toLowerCase();
    if (answer === "y") {
      for (const [key, val] of toChange) {
        currentTasks[key] = val;
        changed.push(key);
        denoJsonDirty = true;
      }
    }
  } else if (toChange.length && dryRun) {
    // In dry-run mode, show what would change without prompting
    for (const [key] of toChange) changed.push(key);
  }

  if (added.length)   console.log(`  ${green("✓")} Tasks added   : ${bold(added.join(", "))}`);
  if (changed.length) console.log(`  ${green("✓")} Tasks updated : ${bold(changed.join(", "))}`);
  if (!added.length && !changed.length && !toChange.length) console.log(`  ${green("✓")} Tasks already in sync.`);

  denoJson.tasks = currentTasks;
}

if (denoJsonDirty) {
  if (!dryRun) {
    await Deno.writeTextFile(denoJsonPath, JSON.stringify(denoJson, null, 2) + "\n");
    console.log("Updated deno.json.");
    if (!isLocal && latestVersion) {
      const currentVersionMatch = currentSpecifier.match(/@(\d+\.\d+\.\d+)/);
      const currentVersion = currentVersionMatch ? currentVersionMatch[1] : null;
      if (currentVersion && currentVersion !== latestVersion) {
        console.log(`\nUpdated @ursamu/ursamu ${currentVersion} → ${latestVersion}`);
        console.log(`Changelog: https://github.com/UrsaMU/ursamu/releases/tag/v${latestVersion}`);
      }
    }
  } else {
    console.log("\nDry run — no files written.");
  }
}

if (dryRun) Deno.exit(0);

// ── 6. re-cache entry points ──────────────────────────────────────────────────

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

// ── 7. sync shell scripts ─────────────────────────────────────────────────────
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

// ── 8. ensure plugins.manifest.json exists + sync upstream refs ───────────────

const manifestPath = join(cwd, "src", "plugins", "plugins.manifest.json");

if (!existsSync(manifestPath)) {
  if (!dryRun) {
    await Deno.mkdir(join(cwd, "src", "plugins"), { recursive: true });
    await Deno.writeTextFile(manifestPath, JSON.stringify(DEFAULT_PLUGINS_MANIFEST, null, 2));
    console.log(`${green("✓")} Created missing src/plugins/plugins.manifest.json`);
  } else {
    console.log(`  Would create src/plugins/plugins.manifest.json`);
  }
} else {
  // Sync refs for any plugin whose upstream ref has been bumped.
  // Preserves any plugins the user added that aren't in DEFAULT_PLUGINS_MANIFEST.
  try {
    const gameManifest = JSON.parse(await Deno.readTextFile(manifestPath)) as { plugins: { name: string; ref?: string; [k: string]: unknown }[] };
    const upstreamByName = Object.fromEntries(DEFAULT_PLUGINS_MANIFEST.plugins.map(p => [p.name, p]));
    let manifestDirty = false;
    const refChanges: string[] = [];

    const gamePluginNames = new Set(gameManifest.plugins.map(p => p.name));
    const added: string[] = [];

    for (const plugin of gameManifest.plugins) {
      const upstream = upstreamByName[plugin.name];
      if (upstream?.ref && plugin.ref !== upstream.ref) {
        refChanges.push(`  ${bold(cyan(plugin.name))}  ${red(plugin.ref ?? "unpinned")} → ${green(upstream.ref)}`);
        plugin.ref = upstream.ref;
        manifestDirty = true;
      }
    }

    // Add any default plugins that are missing from the game manifest entirely
    for (const upstream of DEFAULT_PLUGINS_MANIFEST.plugins) {
      if (!gamePluginNames.has(upstream.name)) {
        gameManifest.plugins.push({ ...upstream });
        added.push(`  ${bold(cyan(upstream.name))}  ${green(upstream.ref ?? "unpinned")}`);
        manifestDirty = true;
      }
    }

    if (manifestDirty) {
      if (!dryRun) {
        await Deno.writeTextFile(manifestPath, JSON.stringify(gameManifest, null, 2));
        if (refChanges.length) {
          console.log(`${green("✓")} Synced plugin refs in src/plugins/plugins.manifest.json:`);
          refChanges.forEach(l => console.log(l));
        }
        if (added.length) {
          console.log(`${green("✓")} Added new default plugins to src/plugins/plugins.manifest.json:`);
          added.forEach(l => console.log(l));
        }
      } else {
        if (refChanges.length) {
          console.log(`  Would update plugin refs:`);
          refChanges.forEach(l => console.log(l));
        }
        if (added.length) {
          console.log(`  Would add missing default plugins:`);
          added.forEach(l => console.log(l));
        }
      }
    } else {
      console.log(`${green("✓")} Plugin refs already up to date.`);
    }
  } catch {
    console.warn(`  Warning: could not sync plugin refs in plugins.manifest.json`);
  }
}
