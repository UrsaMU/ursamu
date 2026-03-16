# UrsaMU Post-1.0 Roadmap

Work items are ordered by community impact. Pick the next unchecked item and go.

---

## Tier 1 — Community will notice immediately

- [x] **Bulletin board (`bboard`)**
  `@bblist`, `@bbread`, `@bbpost`, `@bbcreate`, `@bbdestroy`. Per-player unread tracking via `data.bbLastRead`.

- [x] **Login notifications**
  On connect: unread mail count and new bboard post count shown after welcome message.

- [x] **MOTD**
  `@motd` to view; `@motd/set` / `@motd/clear` for admins. Stored via `u.text` (texts DBO).
  Displayed automatically on every login via `connect.ts`.

- [x] **`@emit` / `@pemit` / `@remit`**
  - `@emit <room>=<msg>` — send to all connected players in a room (no attribution)
  - `@pemit <player>=<msg>` — send privately to any connected player
  - `@remit <room>=<msg>` — send to a room with actor attribution

---

## Tier 2 — Power users will hit these

- [x] **Mail: fix silent aliases and stuck drafts**
  `mail/reply`, `mail/forward`, `mail/cc`, `mail/bcc`, `mail/replyall` — all implemented.
  CC/BCC shown in proof and delivery. Draft warning on reconnect. Switch detection fixed.

- [x] **`@quota` command**
  `@quota` shows your current quota. `@quota <player>=<n>` for admin.

- [ ] **Attribute execution (`&ATTR` triggers)**
  `setAttr.ts` stores attributes but they're inert — can't fire, be triggered, or be read by locks.
  Needs `u.execute()` callable from stored attributes, or a lightweight expression evaluator.
  This is a larger design decision (sandbox policy for per-object scripts).

- [x] **Connection history**
  Last login timestamp and failed attempt count shown on every login.
  `auth:verify` now increments `failedAttempts` on bad password; cleared on successful login.

---

## Tier 3 — Nice to have

- [x] **`@find`**
  `@find <name>`, `@find/flag <flag>`, `@find/type <type>` — search the DB by name/type/flag.

- [x] **`@stats`**
  `@stats` — uptime, connected players, total objects. `@stats/full` — adds per-type breakdown.
  `sys.uptime()` added to SDK; `SERVER_START` constant in SandboxService.

- [ ] **`@wipe`**
  Clear all user-set attributes from an object.
  `@wipe <object>` — removes all `&ATTR`-style attributes. Standard maintenance.

- [ ] **Terminal width detection**
  Auto-detect client terminal width from Telnet NAWS negotiation.
  Store per-session; use in `format.ts` and table layouts instead of hardcoded 78 cols.

- [ ] **`@Aconnect` / `@Adisconnect`**
  Run `&ACONNECT` attribute on the player object and Master Room on login/logout.
  Low priority — most games use dedicated scripts — but MUSH veterans expect it.

---

## Tier 4 — Bigger architectural features

- [ ] **Chargen system (plugin)**
  Character generation room and workflow. Every game needs one but they're all different.
  Build as a first-party plugin in `plugins/chargen/` rather than baking into core.

- [ ] **Web client polish pass**
  The Fresh client (`src/web-client/`) has scene builder, character sheet, code editor, and wiki
  but these haven't been tested or documented to the same standard as the core server.
  Needs: feature audit, e2e tests, and a web-client-specific guide in the docs.

- [ ] **Extensive docs & examples site**
  The current docs cover installation, guides, and API reference. What's missing is depth and
  worked examples that help both non-technical game operators and plugin developers.

  **Operator-focused:**
  - Step-by-step "build your first room network" tutorial
  - "Set up a Discord bridge" walkthrough
  - Scene export workflow guide
  - Hosting on a VPS (nginx reverse proxy, systemd service, TLS with Let's Encrypt)
  - Docker deployment guide (production-grade `docker-compose.yaml` with env vars)
  - Backup and restore procedures for Deno KV databases

  **Developer-focused:**
  - Full SDK cookbook: one page per `u.*` namespace with real examples
  - "Build your first plugin" end-to-end tutorial
  - "Build your first system script" tutorial
  - Plugin registry / showcase page (community plugins)
  - Recipes section: common patterns (room descriptions, object triggers, score sheets, etc.)
  - Migration guide: "Coming from PennMUSH — here's the UrsaMU equivalent"

  **Site infrastructure:**
  - Wire up the Lume search plugin (already imported, not yet configured)
  - Versioned docs (so 1.0 docs don't disappear when 2.0 ships)
  - "Edit this page on GitHub" link on every doc page
  - Contribution guide for the docs themselves

---

## Completed (shipped in 1.0.0)

- [x] WebSocket hub with rate limiting (10 cmd/sec)
- [x] Telnet sidecar
- [x] Sandbox scripting (Web Workers + `u` SDK)
- [x] All core player commands (`look`, `say`, `pose`, `page`, `who`, `score`, `inv`, `get`, `drop`, `give`, `home`, `teleport`, `examine`)
- [x] Building commands (`@dig`, `@open`, `@link`, `@unlink`, `@create`, `@destroy`, `@clone`, `@parent`, `@lock`, `@set`)
- [x] Admin commands (`@boot`, `@toad`, `@newpassword`, `@chown`, `@reboot`, `@shutdown`, `@moniker`)
- [x] Channel system (`@channel/list/join/leave`, `@chancreate`, `@chandestroy`, `@chanset`)
- [x] Mail system (`@mail` list/read/send/draft/delete)
- [x] Discord bridge with reconnect
- [x] Scene tracking + REST export (markdown/JSON)
- [x] First-run superuser setup (interactive prompt)
- [x] Auto-`look` on connect
- [x] Flag-based permissions (`superuser`/`admin`/`wizard`/`storyteller`/`builder`/`player`)
- [x] `&ATTR` attribute storage (`setAttr.ts`)
- [x] Command switches (`@cmd/switch` syntax parsed and passed to scripts)
- [x] 294 passing tests
