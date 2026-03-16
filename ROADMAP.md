# UrsaMU Post-1.0 Roadmap

Work items are ordered by community impact. Pick the next unchecked item and go.

---

## Tier 1 — Community will notice immediately

- [ ] **Bulletin board (`bboard`)**
  DB collection exists. Need in-game commands: `@bb`, `@bbread`, `@bbpost`, `@bbnew`, `@bblist`.
  The social backbone of every MUSH — announcements, rules, IC news, OOC discussion.

- [ ] **Login notifications**
  On connect, show: "You have 2 unread mail messages." and "There are 4 new bboard posts since your last visit."
  Hook into `system/scripts/connect.ts` after `u.execute("look")`.

- [ ] **MOTD**
  Display `text/motd.txt` (and `text/wizmotd.txt` for wizards) after authentication.
  Add `@motd` command to view/set from in-game. Admins live by this for announcements and event notices.

- [ ] **`@emit` / `@pemit` / `@remit`**
  Staff broadcasting tools. No implementation exists.
  - `@emit <room>=<msg>` — send to a room (no attribution)
  - `@pemit <player>=<msg>` — send privately to any player
  - `@remit <room>=<msg>` — send to a room with attribution (like a pose)

---

## Tier 2 — Power users will hit these

- [ ] **Mail: fix silent aliases and stuck drafts**
  `mail/reply`, `mail/forward`, `mail/cc`, `mail/bcc` are in the aliases list but missing from the
  `switch` statement — they silently do nothing. Also: draft state stored in `en.state.tempMail`
  persists across disconnects; add a timeout/cleanup or warn on reconnect.

- [ ] **`@quota` command**
  `@create` already checks and deducts quota but there's no way to view or set it.
  - `@quota` — show your current quota
  - `@quota <player>=<n>` — admin sets quota on a player

- [ ] **Attribute execution (`&ATTR` triggers)**
  `setAttr.ts` stores attributes but they're inert — can't fire, be triggered, or be read by locks.
  Needs `u.execute()` callable from stored attributes, or a lightweight expression evaluator.
  This is a larger design decision (sandbox policy for per-object scripts).

- [ ] **Connection history**
  On connect, show last login time/IP and failed attempt count.
  Store `lastLogin`, `lastIp`, `failedAttempts` in player data; display in `connect.ts`.

---

## Tier 3 — Nice to have

- [ ] **`@find`**
  Search the DB by name/type/flag from in-game.
  `@find <name>` — list matching objects with dbref. Admins use this constantly.

- [ ] **`@stats`**
  Server uptime, object counts by type, connected player count.
  `@stats` — summary view; `@stats/full` — detailed breakdown.

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
- [x] 294 passing tests
