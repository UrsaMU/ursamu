/**
 * Canonical task definitions for UrsaMU game projects.
 *
 * Used by both `create.ts` (initial scaffold) and `update.ts` (task sync on upgrade)
 * so there is a single source of truth for what tasks a game project should have.
 */
export const GAME_PROJECT_TASKS: Record<string, string> = {
  "start":   "bash ./scripts/run.sh",
  "daemon":  "bash ./scripts/daemon.sh",
  "stop":    "bash ./scripts/stop.sh",
  "restart": "bash ./scripts/restart.sh",
  "status":  "bash ./scripts/status.sh",
  "logs":    "tail -f logs/main.log logs/telnet.log",
  "update":  "deno run -A jsr:@ursamu/ursamu/cli update",
  "server":  "deno run -A --watch --unstable-detect-cjs --unstable-kv ./src/main.ts",
  "telnet":  "deno run -A --unstable-detect-cjs --unstable-kv ./src/telnet.ts",
  "test":    "deno test --allow-all --unstable-kv --no-check",
};
