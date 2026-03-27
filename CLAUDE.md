# UrsaMU — Price of Power

## Project Overview

This is UrsaMU, a MUSH-like game engine running **The Price of Power**, a Vampire: The Dark Ages text-based RPG. The user is the game operator, not a developer — use plain language, not jargon.

## Branch Strategy

- **main** — Clean upstream UrsaMU engine only. No plugins. Tracks `upstream/main`.
- **game** — Engine + all plugins. This is what runs on the production server. Work happens here.
- **Individual repos** — Public plugins released separately for other developers.

## Production Server

- **IP:** 174.138.61.112 (DigitalOcean droplet)
- **SSH:** `ssh -i C:/Users/cjh11/.ssh/id_rsa root@174.138.61.112`
- **Working directory:** `/root/my-game`
- **Services:** `priceofpower` (main), `priceofpower-telnet` (telnet sidecar)
- **Both services need `--unstable-kv --unstable-net` flags**
- **SFTP upload-on-save** is configured in VS Code

## CRITICAL SERVER RULES

1. **NEVER run `git reset --hard` on the production server.** This destroys untracked files and has caused extended outages.
2. **NEVER clear the Deno cache** (`/root/.cache/deno`) on the server.
3. **NEVER disconnect players** from the game server unless absolutely necessary.
4. **If something goes wrong, restore from DigitalOcean daily backup** — don't try to fix with destructive git commands.
5. **To deploy changes:** copy individual files with `scp`, then `systemctl restart priceofpower`. No git on the server.

## Updating from Upstream

When pulling updates from the upstream UrsaMU engine:

1. **ONLY update non-plugin engine files.** We do NOT need any of upstream's plugins.
2. Engine files live in: `src/services/`, `src/commands/`, `src/routes/`, `src/@types/`, `src/utils/`, `system/scripts/`, `deno.json`, `deps.ts`, `mod.ts`
3. **NEVER install, copy, or overwrite anything in `src/plugins/` from upstream.**
4. **Our plugins ALWAYS take priority.** If upstream ships a plugin we already have (jobs, bbs, discord, etc.), ignore theirs.
5. **The manifest (`src/plugins/plugins.manifest.json`) must always be empty** (`{"plugins":[]}`). The `ensurePlugins` system auto-installs upstream plugins that conflict with ours and causes startup hangs.
6. **The `.gitignore` in `src/plugins/` must track all subdirectories** (not the upstream default which ignores them).

## Our Plugins

These are custom and take priority over anything upstream provides:

- **pop** — Price of Power game plugin (game-specific, NEVER public)
- **bboards** — Modified Myrddin-style BBS (public repo: `chogan1981/modified-bbs-for-ursamu`)
- **jobs** — Anomaly-style jobs/request system
- **rhost-vision** — Rhost-style room display, WHO, +finger, +namecolor, say/pose overrides
- **discord** — Discord webhook integration
- **gridbuilder** — World-building grid loader
- **ursamu-help** — Modified help system (not completed yet)

Plugins we removed and do NOT want: `events`, `wiki`, `example`, `chargen` (upstream's — POP has its own chargen inside `src/plugins/pop/chargen.ts`)

## Claude Relay

The test relay connects Claude to the live game server for testing:
- **Script:** `src/plugins/pop/test-relay.ts` (port 9877)
- **API:** `POST /send` with `{"msg": "command"}`, `GET /read`, `GET /status`
- **Test commands in-game as Claude via the relay before asking the user to test.**

## File Changes

- **Stat JSON files** (`src/plugins/pop/stat/`), **help files**, **rules**, **policy** — no restart needed, served on request.
- **TypeScript source files** (`src/`) — require server restart.
- **System scripts** (`system/scripts/`) — loaded at startup, require restart.
- **Rhost-vision overrides** — the plugin copies its overrides into `system/scripts/` at startup.
