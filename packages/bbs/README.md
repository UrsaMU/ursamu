# @ursamu/bbs

**1.0.0** — Myrddin-style bulletin boards for UrsaMU
(command UX parity, not a softcode clone).

Boards, threaded posts, sticky/flags, categories, board
moderators, archive boards, Discord webhooks, optional
jobs-bridge, and HTTP under `/api/v1/boards`.

| Doc | Contents |
|-----|----------|
| [docs/MYRDDIN.md](./docs/MYRDDIN.md) | In-game command parity |
| [docs/REST.md](./docs/REST.md) | HTTP API contract |
| [docs/STABLE.md](./docs/STABLE.md) | 1.0 readiness + version policy |

---

## Install

### 1. Peers

| Peer | Range | Required |
|------|-------|----------|
| `@ursamu/mush` | `^1.0.0` | Yes — engine |
| `@ursamu/help` | `^1.0.0` | Yes — `+help` topics |
| `@ursamu/jobs` | `^1.1.1` | No — Jobs board mirror |

Jobs is **soft-optional**. BBS starts without it; if jobs is
loaded, lifecycle events mirror onto the seeded **Jobs** board.

### 2. Import map (example)

```json
{
  "imports": {
    "@ursamu/bbs": "jsr:@ursamu/bbs@^1.0.0",
    "@ursamu/mush": "jsr:@ursamu/mush@^1.0.0",
    "@ursamu/help": "jsr:@ursamu/help@^1.0.0",
    "@ursamu/jobs": "jsr:@ursamu/jobs@^1.1.1"
  }
}
```

### 3. Enable in game config

```json
{
  "server": {
    "plugins": [
      "@ursamu/help",
      "@ursamu/bbs",
      "@ursamu/jobs"
    ]
  }
}
```

Order: load **help** before bbs (help dir registration).
Jobs may load before or after bbs.

### 4. Restart the game

On init, bbs:

1. Registers `+bb*` commands and help under section `bbs`
2. Registers REST `/api/v1/boards`
3. Seeds default boards if missing (see below)
4. Soft-loads `@ursamu/jobs` and wires the job bridge

Confirm in logs:

```text
[bbs] Plugin initialized — +bb commands active, /api/v1/boards …
[bbs] Default boards seeded (Announcements, OOC, Jobs).
```

---

## Default boards

Created once by title (idempotent):

| Board | Category | Read | Write |
|-------|----------|------|-------|
| Announcements | Public | all | staff only |
| OOC | Public | all | all |
| Jobs | Staff | staff | staff |

Staff = flags `admin`, `wizard`, or `superuser`.

Custom boards: in-game `+bbnewgroup` or
`POST /api/v1/boards` (staff JWT).

---

## Configuration

Optional collection names (defaults shown):

```json
{
  "plugins": {
    "bbs": {
      "db": {
        "bboards": "server.bboards",
        "posts": "server.bboard_posts"
      }
    }
  }
}
```

### Data layout (frozen for 1.0)

| Collection | Contents |
|------------|----------|
| `server.bboards` | Board records (`IBoard`) |
| `server.bboard_posts` | Posts + nested replies |

Legacy `server.*` names are intentional — renaming would
orphan live games. Do not rename without a migration plan.

Per-player read state lives on the player object:

```text
state.bb_read[boardNum] = ["1", "2", …]   // preferred
data.bb_read[…]                           // legacy fallback
```

Membership / notify / drafts / sig also use player `state`
(see `src/tracking.ts`).

---

## In-game use

Players and staff use `+bb*` commands. Full matrix:
[docs/MYRDDIN.md](./docs/MYRDDIN.md).

| Area | Examples |
|------|----------|
| Read | `+bblist`, `+bbread`, `+bbnext`, `+bbcatchup` |
| Post | `+bbpost`, `+bbreply`, `+bbedit`, `+bbremove` |
| Social | `+bbjoin`, `+bbleave`, `+bbnotify`, `+bbwatch` |
| Staff | `+bbnewgroup`, `+bblock`, `+bbsticky`, `+bbwebhook` |

Help: `+help bbs` and topic files under `help/`.

---

## REST

Engine JWT required on every call:

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

Prefix: **`/api/v1/boards`**

| Method | Path | Who |
|--------|------|-----|
| GET | `/boards` | Readable boards + counts |
| POST | `/boards` | Staff — create board |
| GET/PATCH/DELETE | `/boards/:id` | Read lock / staff |
| GET/POST | `/boards/:id/posts` | Read / write lock |
| GET/PATCH/DELETE | `/boards/:id/posts/:num` | See REST.md |
| GET/DELETE | `…/posts/:num/flags` | Mod or staff |
| POST | `…/posts/:num/watch` | Toggle watch |
| POST | `/boards/:id/read` | Mark board read |

Full contract (bodies, locks, status codes):
**[docs/REST.md](./docs/REST.md)**.

### Operator notes

- Board `:id` is the string id (`board-1`), not display `#1`.
- **Sticky:** create post, then `PATCH` `{ "sticky": true }`.
- **Replies:** create with `+bbreply` in-game; they appear on
  GET post. No REST reply-create in this line.
- **Staff SPA (this package):** open
  `http://localhost:4203/admin/bbs/` after install.
  Build UI with `deno task ui:build` before publish.

---

## Locks

| Value | Effect |
|-------|--------|
| missing, `""`, `all()` | Open to authenticated users |
| `faction` + `ownerId` | Faction object `contents` |
| anything else | Staff only (e.g. `admin+`) |

Staff always bypasses locks. Archive boards
(`type: "archive"`) are read-only for posts.

Board moderators (`moderators: string[]` of player ids)
may sticky, clear flags, and edit/delete like staff on
that board.

---

## Security

| Topic | Behavior |
|-------|----------|
| Staff flags | Exact tokens only — `notadmin` ≠ staff |
| Webhooks | HTTPS only; private/link-local blocked |
| | (`src/url-safety.ts`) before fire |
| Watchers | Cap 50 per post |
| Flag reasons | Sanitized on write (see security tests) |
| REST 401 | No `userId` — no work |
| REST 403 | Authenticated but lock/role fails |

Do not put untrusted webhook URLs on boards. Prefer
Discord (or similar) HTTPS endpoints you control.

---

## Optional jobs bridge

When `@ursamu/jobs@^1.1.1` is present:

- New jobs → post on the **Jobs** board
- Assign / comment / status / priority / resolve / reopen
  → replies on that thread

If jobs is absent, bbs logs nothing and continues.

---

## Programmatic use

```ts
import { seedBoards } from "@ursamu/bbs";

// Idempotent custom boards at game boot:
await seedBoards([
  "OOC",
  {
    name: "IC Events",
    category: "Roleplay",
    readLock: "all()",
    writeLock: "all()",
  },
]);
```

Stable exports: see `mod.ts` and `docs/STABLE.md`
(plugin default, `seedBoards`, display helpers, rest-auth
helpers, types).

---

## Non-goals

Not planned as softcode clones:

- Softcode installer / SHA1 board objects
- Per-player color theme attributes
- Full lockfunc language on REST locks
  (`all` / `faction` / staff is the supported set)
- Full multi-section staff console (that is `@ursamu/web`;
  this package ships a **BBS-only** SPA at `/admin/bbs/`)

---

## Staff SPA

Shipped inside this package (not `@ursamu/web`):

```text
http://localhost:4203/admin/bbs/
```

```bash
deno task ui:install   # once
deno task ui:build     # → dist/
deno task ui:dev       # Vite on :5174, proxies /api
```

`init()` registers `GET /admin/bbs/*` static files from `dist/`
(fallback placeholder in `admin/` if unbuilt).

---

## Develop / test

```bash
cd packages/bbs
deno check mod.ts --unstable-kv
deno lint
deno task test
deno task ui:build
```

Publish (maintainers): build UI first so `dist/` is included.

```bash
deno task ui:build
deno task preflight
deno task publish   # needs JSR token
```

---

## License

MIT
