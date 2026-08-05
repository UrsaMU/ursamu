# REST API — `/api/v1/boards`

Stable HTTP surface for `@ursamu/bbs`. Registered via
`registerPluginRoute("/api/v1/boards", …)`.

Auth is the engine JWT (or session) middleware: every handler
receives `userId`. **All routes require a logged-in user.**

```http
Authorization: Bearer <jwt>
Content-Type: application/json
```

Errors are JSON: `{ "error": "<message>" }` unless noted
(204 empty body).

---

## Auth model

| Role | Meaning |
|------|---------|
| **Player** | Any authenticated `userId` |
| **Staff** | Flags `admin`, `wizard`, or `superuser` (exact tokens) |
| **Board mod** | `userId` in `board.moderators` (bare id, `#` optional) |

### Locks

| Lock value | Read / write |
|------------|----------------|
| missing, `""`, `all()` | Open to all authenticated users |
| `faction` + `ownerId` | Faction object `contents` must include user |
| `flag(name)` | Caller has that flag |
| `perm(level)` | Privilege ladder (builder/admin/wizard/…) |
| `admin+`, `wizard+`, … | Legacy bare ladder (same as perm) |
| `flag(a) \|\| flag(b)`, `&&`, `!`, `()` | Boolean combinations |

Staff always bypass locks. Unknown funcs (`attr`, `holds`)
fail closed for non-staff. Archive boards (`type: "archive"`)
deny **write** for everyone (including staff) on POST posts.

Sticky / timeout / clear-flags require **staff or board mod**.

---

## Types (response shapes)

### Board (`IBoard` + list extras)

```ts
{
  id: string;           // e.g. "board-1"
  num: number;          // display number
  title: string;
  timeout: number;      // default post timeout days
  anonymous: boolean;
  readLock: string;
  writeLock: string;
  pendingDelete: boolean;
  category: string;     // default "General"
  type: "normal" | "archive";
  ownerId?: string;
  moderators: string[];
  webhookUrl?: string;
  archiveTo?: string;
  // GET /boards list only:
  postCount?: number;
  unreadCount?: number;
  flaggedCount?: number;
}
```

### Post (`IPost`)

```ts
{
  id: string;           // UUID
  boardId: number;      // board.num
  num: number;          // post number on board
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;    // epoch ms
  timeout: number;
  editCount: number;
  replies: IReply[];
  sticky: boolean;
  icTag?: "ic" | "ooc";
  sceneId?: string | null;
  tags: string[];
  flags: IFlag[];
  watchers: string[];   // capped at 50
}
```

### Reply (`IReply`)

```ts
{
  num: number;
  subject: string;
  body: string;
  authorId: string;
  authorName: string;
  createdAt: number;
  editCount: number;
  icTag?: "ic" | "ooc";
}
```

### Flag (`IFlag`)

```ts
{
  playerId: string;
  playerName: string;
  reason: string;
  createdAt: number;
}
```

---

## Routes

### `GET /api/v1/boards/categories`

List distinct category labels.

| | |
|--|--|
| Auth | Player |
| 200 | `{ categories: string[] }` |
| 401 | Unauthorized |

---

### `GET /api/v1/boards`

List boards the caller can **read**, with counts.

| | |
|--|--|
| Auth | Player |
| 200 | `Board[]` (extras: `postCount`, `unreadCount`, `flaggedCount`) |
| 401 | Unauthorized |

Unread is relative to `state.bb_read` (legacy `data.bb_read`).

---

### `POST /api/v1/boards`

Create a board.

| | |
|--|--|
| Auth | **Staff** |
| Body | `{ name: string, category?: string }` |
| 201 | `Board` |
| 400 | `name is required` / invalid JSON |
| 401 | Unauthorized |
| 403 | Forbidden |
| 409 | Board already exists |

Defaults: `readLock`/`writeLock` = `all()`, `type` = `normal`,
`moderators` = `[]`, `timeout` = `0`.

---

### `GET /api/v1/boards/:id`

Fetch one board by **id** (e.g. `board-1`), not display num.

| | |
|--|--|
| Auth | Player + **read** lock |
| 200 | `Board` |
| 401 | Unauthorized |
| 403 | Forbidden |
| 404 | Not found |

---

### `PATCH /api/v1/boards/:id`

Update board settings.

| | |
|--|--|
| Auth | **Staff** |
| Body | Partial fields below |
| 200 | Updated `Board` |
| 400 | Invalid JSON |
| 401 / 403 / 404 | Standard |

**Allowed fields:**  
`title`, `readLock`, `writeLock`, `timeout`, `anonymous`,
`category`, `type`, `webhookUrl`, `archiveTo`, `ownerId`,
`moderators`

`moderators`: `string[]` or space/comma-separated string;
ids are bare-normalized (`#12` → `12`).

---

### `DELETE /api/v1/boards/:id`

Delete board **and all posts**.

| | |
|--|--|
| Auth | **Staff** |
| 204 | Empty body |
| 401 / 403 / 404 | Standard |

---

### `GET /api/v1/boards/:id/posts`

List posts (sticky first, then num ascending).

| | |
|--|--|
| Auth | Player + **read** lock |
| Query | `limit` (default 20), `offset` (default 0) |
| 200 | `{ total: number, posts: IPost[] }` |
| 401 / 403 / 404 | Standard |

---

### `POST /api/v1/boards/:id/posts`

Create a root post.

| | |
|--|--|
| Auth | Player + **write** lock |
| Body | `{ subject: string, body: string }` |
| 201 | `IPost` |
| 400 | Archive board / missing subject or body / bad JSON |
| 401 / 403 / 404 | Standard |

**Sticky:** not set on create (`sticky: false`). Staff/mod
may `PATCH` the post with `{ "sticky": true }` afterward
(two-step).

---

### `POST /api/v1/boards/:id/posts/:num/replies`

Create a reply on a post.

| | |
|--|--|
| Auth | Player + **write** lock |
| Body | `{ body: string }` |
| 201 | `IReply` |
| 400 | Archive / missing body / bad JSON |
| 401 / 403 / 404 | Standard |

Existing replies are also returned on `GET` post.

---

### `GET /api/v1/boards/:id/posts/:num`

Fetch one post by **board-local number**.

| | |
|--|--|
| Auth | Player + **read** lock |
| 200 | `IPost` (includes `replies`) |
| 401 / 403 / 404 | Standard |

---

### `PATCH /api/v1/boards/:id/posts/:num`

Edit post.

| | |
|--|--|
| Auth | Author, board mod, or staff |
| Body | Partial below |
| 200 | Updated `IPost` |
| 400 | Invalid JSON |
| 401 / 403 / 404 | Standard |

| Field | Who may set |
|-------|-------------|
| `subject`, `body` | Author, mod, staff (bumps `editCount`) |
| `sticky` | Mod or staff only |
| `timeout` | Mod or staff only |

---

### `DELETE /api/v1/boards/:id/posts/:num`

Delete one post.

| | |
|--|--|
| Auth | Author, board mod, or staff |
| 204 | Empty body |
| 401 / 403 / 404 | Standard |

---

### `GET /api/v1/boards/:id/posts/:num/flags`

List flags on a post.

| | |
|--|--|
| Auth | Board mod or staff |
| 200 | `{ flags: IFlag[] }` |
| 401 / 403 / 404 | Standard |

---

### `DELETE /api/v1/boards/:id/posts/:num/flags`

Clear all flags on a post.

| | |
|--|--|
| Auth | Board mod or staff |
| 204 | Empty body |
| 401 / 403 / 404 | Standard |

---

### `POST /api/v1/boards/:id/posts/:num/watch`

Toggle watch for the current user (max 50 watchers).

| | |
|--|--|
| Auth | Player (no board lock check today) |
| 200 | `{ watching: boolean }` — new state after toggle |
| 401 / 404 | Standard |

---

### `POST /api/v1/boards/:id/read`

Mark all posts on the board read for the caller
(`state.bb_read[boardNum] = […]`).

| | |
|--|--|
| Auth | Player |
| 200 | `{ read: true }` |
| 401 / 404 | Standard |

---

## Status code summary

| Code | Meaning |
|------|---------|
| 200 | OK (JSON) |
| 201 | Created |
| 204 | No content |
| 400 | Bad request / archive write |
| 401 | Missing auth |
| 403 | Authenticated but not allowed |
| 404 | Unknown path, board, or post |
| 409 | Duplicate board title |

---

## Compatibility notes (pre-1.0 freeze)

1. **Board `:id` is the string id** (`board-N`), not `num`.
2. **No REST reply create** — replies only via softcode/commands
   until a dedicated route lands; they still appear on GET.
3. **Sticky on create is two-step** — POST then PATCH sticky.
4. **Webhook URLs** — HTTPS only at command layer; REST stores
   the field; SSRF checks apply when firing webhooks.
5. Breaking route or auth changes after **1.0.0** require a
   major version bump (see `docs/STABLE.md`).

---

## Related

- Auth helpers: `src/rest-auth.ts`
- In-game parity: `docs/MYRDDIN.md`
- Stability: `docs/STABLE.md`
