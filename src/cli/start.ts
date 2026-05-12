/**
 * @module start
 * @description The orchestrator script for the UrsaMU engine.
 *
 * This module handles the "zero-config" startup flow:
 * 1. Initializes configuration.
 * 2. Checks for (or interactively creates) a superuser.
 * 3. Spawns the main game server and telnet server as child processes.
 * 4. Manages process lifecycles and graceful shutdown.
 */

import { join } from "jsr:@std/path@^0.224.0";
import { checkAndCreateSuperuser } from "../main.ts";
import { initConfig } from "../services/Config/mod.ts";
import { DBO } from "../services/Database/database.ts";

/**
 * Orchestrator script to start UrsaMU
 * 1. Checks/Creates Superuser (interactive)
 * 2. Spawns Game Server and Telnet Server
 */

// 1. Initialize Config (needed for DB connection)
await initConfig();

// 2. Run Superuser Setup (Interactive)
try {
  await checkAndCreateSuperuser();
  // Close DB connection to release locks/flush for child processes
  await DBO.close();
} catch (e) {
  console.error("Error during startup check:", e);
  try { await DBO.close(); } catch { /* ignore close errors */ }
  Deno.exit(1);
}

// 3. Spawn Processes
console.log("\n🚀 Starting UrsaMU Servers...");

// Helper to spawn
const spawnInherit = (script: string) => {
  const cmd = new Deno.Command(Deno.execPath(), {
    args: [
      "run", 
      "-A", 
      "--unstable-detect-cjs",
      "--unstable-kv",
      "--unstable-net",
      join(Deno.cwd(), script)
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  return cmd.spawn();
}

// Telnet runs as a long-lived independent process — it only goes down on hard shutdown (SIGINT).
const telnetProc = spawnInherit("src/telnet.ts");

// Spawn Web Client (optional — only if src/web-client exists)
const webClientDir = join(Deno.cwd(), "src", "web-client");
let webProc: Deno.ChildProcess | null = null;
try {
  const stat = await Deno.stat(webClientDir);
  if (stat.isDirectory) {
    console.log("Starting Web Client...");
    webProc = new Deno.Command(Deno.execPath(), {
      args: ["task", "start"],
      cwd: webClientDir,
      stdout: "inherit",
      stderr: "inherit",
    }).spawn();
  }
} catch {
  // No web client directory — skip silently
}


const REBOOT_CODE = 75;

// SIGUSR2 is the "no-disconnect restart" signal: scripts/restart.sh sends it.
// The supervisor kills the current main child, but treats the exit as a
// reboot rather than a shutdown so telnet stays up and clients auto-reauth.
let rebootRequested = false;
let currentMain: Deno.ChildProcess | null = null;

const runMain = async () => {
  while (true) {
    currentMain = spawnInherit("src/main.ts");
    const { code } = await currentMain.status;
    currentMain = null;
    if (code === REBOOT_CODE || rebootRequested) {
      rebootRequested = false;
      console.log("\n🔄 Restarting main server...");
      continue;
    }
    break;
  }
};

const cleanup = () => {
  console.log("\nShutting down servers...");
  try { telnetProc.kill(); } catch { /* ignore */ }
  try { webProc?.kill(); } catch { /* ignore */ }
};

Deno.addSignalListener("SIGINT", () => {
  cleanup();
  Deno.exit(0);
});

// SIGTERM = clean shutdown (matches stop.sh semantics — disconnects everyone).
Deno.addSignalListener("SIGTERM", () => {
  cleanup();
  try { currentMain?.kill("SIGTERM"); } catch { /* ignore */ }
  Deno.exit(0);
});

// SIGUSR2 = no-disconnect restart. Equivalent to in-game @reboot.
Deno.addSignalListener("SIGUSR2", () => {
  console.log("\n🛰  SIGUSR2 received — restarting main without dropping telnet.");
  rebootRequested = true;
  try { currentMain?.kill("SIGTERM"); } catch { /* ignore */ }
});

await runMain();
cleanup();
