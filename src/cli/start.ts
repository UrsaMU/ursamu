import { join } from "@std/path";
import { checkAndCreateSuperuser } from "../main.ts";
import { initConfig } from "../services/Config/mod.ts";
import { DBO } from "../services/Database/database.ts";

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
      join(Deno.cwd(), script)
    ],
    stdout: "inherit",
    stderr: "inherit",
  });
  return cmd.spawn();
}

const mainProc = spawnInherit("src/main.ts");
const telnetProc = spawnInherit("src/telnet.ts");

// Spawn Web Client
console.log("Starting Web Client...");
const webProc = new Deno.Command(Deno.execPath(), {
  args: ["task", "start"],
  cwd: join(Deno.cwd(), "src", "web-client"),
  stdout: "inherit",
  stderr: "inherit",
}).spawn();


// Handle cleanup
const cleanup = () => {
  console.log("\nShutting down servers...");
  try { mainProc.kill(); } catch { /* ignore */ }
  try { telnetProc.kill(); } catch { /* ignore */ }
  try { webProc.kill(); } catch { /* ignore */ }
};

Deno.addSignalListener("SIGINT", () => {
  cleanup();
  Deno.exit(0);
});

// Wait for processes
await Promise.all([mainProc.status, telnetProc.status]);
