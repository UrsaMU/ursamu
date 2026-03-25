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
  "server":  "deno run -A --watch --unstable-detect-cjs --unstable-kv --unstable-net ./src/main.ts",
  "telnet":  "deno run -A --unstable-detect-cjs --unstable-kv --unstable-net ./src/telnet.ts",
  "test":    "deno test --allow-all --unstable-kv --no-check",
};

/** Default plugins.manifest.json written into new projects and restored by update. */
export const DEFAULT_PLUGINS_MANIFEST = {
  plugins: [
    {
      name: "builder",
      url: "https://github.com/UrsaMU/builder-plugin",
      ref: "v1.0.0",
      description: "World-building commands (@dig, @open, @link, @describe, @examine, and more) plus REST API.",
      ursamu: ">=1.9.5",
    },
    {
      name: "channel",
      url: "https://github.com/UrsaMU/channel-plugin",
      ref: "v1.0.0",
      description: "Channel system — alias dispatch, auto-join on login, @chancreate/@chandestroy/@chanset/@channel, message history.",
      ursamu: ">=1.9.27",
    },
    {
      name: "help",
      url: "https://github.com/UrsaMU/help-plugin",
      ref: "v1.0.0",
      description: "API-first help system — aggregates command help, per-plugin help folders, and runtime DB entries.",
      ursamu: ">=1.9.0",
    },
    {
      name: "bbs",
      url: "https://github.com/UrsaMU/bbs-plugin",
      ref: "v1.0.1",
      description: "Full-featured Myrddin-style BBS — boards, threading, categories, and more.",
      ursamu: ">=1.9.0",
    },
    {
      name: "mail",
      url: "https://github.com/UrsaMU/mail-plugin",
      ref: "v1.0.1",
      description: "In-game mail system — drafts, reply/forward, folders, attachments, quota, expiry.",
      ursamu: ">=1.9.3",
    },
    {
      name: "wiki",
      url: "https://github.com/UrsaMU/wiki-plugin",
      ref: "v1.0.0",
      description: "File-based markdown wiki — pages, search, history, access control, backlinks.",
      ursamu: ">=1.9.0",
    },
  ],
};
