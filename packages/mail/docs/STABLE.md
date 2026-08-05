# Stable API contract (mail 2.5 / engine 1.x floor)

Breaking changes to **stable** exports require a **major** bump.
This line targets `@ursamu/mush@^1.0.0` and `@ursamu/help@^1.0.0`.

## Stable (semver-covered)

**Plugin**
  `mailPlugin` / default — `init` / `remove`
  Depends on plugin `help` >= 1.0.0

**Types / DB**
  `IMail`, `mailDb`, `MAIL_QUOTA`, `EXPIRY_SWEEP_MS`

**Helpers**
  `getMyMail`, `countPlayerMail`, `resolveNames`,
  `runExpirySweep`

**Draft state**
  `getDraft`, `setDraft`, `getMailState`, `MailPlayerState`

**REST**
  `mailRouteHandler` at `/api/v1/mail`

## In-game commands

| Command | Lock | Role |
|---------|------|------|
| `@mail` | connected | Inbox / read / draft start |
| `-` line | connected | Append draft body |
| `@mail/send` | connected | Send draft |
| `@mail/abort` | connected | Discard draft |
| `@mail/reply` / `@mail/forward` | connected | Compose from message |
| `@mail/trash` / restore / purge | connected | Folders |
| `@mailstat` | admin+ | Stats |

Exact switches live on the catch-all `@mail` handler
(`@mail/<switch>`).

## REST (auth required)

| Method | Path | Role |
|--------|------|------|
| GET | `/api/v1/mail` | Inbox (`?folder=`) |
| GET | `/api/v1/mail/sent` | Sent |
| GET | `/api/v1/mail/:id` | Read |
| POST | `/api/v1/mail` | Send |
| PATCH | `/api/v1/mail/:id` | folder / starred |
| DELETE | `/api/v1/mail/:id` | trash or hard delete |

401 when `userId` is null before any work.

## Evolving

- Attachment size limits and MIME policy
- Expiry sweep interval tuning
- Draft proof UX copy

## Dependencies

- `@ursamu/mush@^1.0.0`, `@ursamu/core@^1.0.0` (via mush)
- `@ursamu/help@^1.0.0`

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or REST path | major |
| New folder type, additive mail field | minor |
| Bugfix, docs, tests | patch |

Note: package major is already **2.x** (historical). Engine-floor
freeze is **2.5.0**, not a reset to 1.0.0.
