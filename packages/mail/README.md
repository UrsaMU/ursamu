# @ursamu/mail

**Version 2.5.0** (stable on mush/help **1.x**).

In-game mail for [UrsaMU](https://jsr.io/@ursamu/mush) — drafts,
reply/forward, folders, attachments, quota, expiry, and REST.

See `CHANGELOG.md` and `docs/STABLE.md`.

> Already past 1.0 historically (2.x line). **2.5.0** freezes the
> public surface on the engine 1.0 floor.

## Stable API (2.5)

| Export | Purpose |
|--------|---------|
| `mailPlugin` / default | IPlugin bootstrap |
| `IMail`, `mailDb` | Message type and collection |
| `getMyMail`, `countPlayerMail` | Inbox helpers |
| `getDraft` / `setDraft` | Draft state |
| `mailRouteHandler` | `/api/v1/mail` |
| `runExpirySweep` | Expiry job |

## Install

```ts
// deno.json
{
  "imports": {
    "@ursamu/mail": "jsr:@ursamu/mail@^2.5.0"
  }
}
```

```json
{
  "server": {
    "plugins": ["@ursamu/mail"]
  }
}
```

## Peer dependencies

| Package | Role |
|---------|------|
| `@ursamu/mush` `^1.0.0` | Engine (`addCmd`, DBO, hooks) |
| `@ursamu/help` `^1.0.0` | Help directory registration |

## Commands

| Command | Description |
|---------|-------------|
| `@mail` | List inbox |
| `@mail <n>` | Read message `n` |
| `@mail <player>=<subject>` | Start draft |
| `-<text>` | Append draft line |
| `@mail/send` / `@mail/abort` | Send or discard |
| `@mail/reply` / `@mail/forward` | Reply / forward |
| `@mail/trash` / `@mail/restore` / `@mail/purge` | Folders |
| `@mailstat` | Admin stats |

## Configuration

```json
{
  "plugins": {
    "mail": {
      "db": "mail.messages"
    }
  }
}
```

## REST

All routes require auth. Base: `/api/v1/mail`.

| Method | Path | Action |
|--------|------|--------|
| GET | `/` | Inbox (`?folder=trash`) |
| GET | `/sent` | Sent by caller |
| GET | `/:id` | Read (marks read) |
| POST | `/` | Send now |
| PATCH | `/:id` | `folder` / `starred` |
| DELETE | `/:id` | Soft trash or hard delete |

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or REST path | major (3.0) |
| New feature, additive field | minor |
| Bugfix, docs | patch |

## Development

```bash
deno task test
deno task check
deno task preflight
```

## License

MIT
