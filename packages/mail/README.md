# @ursamu/mail

In-game mail plugin for [UrsaMU](https://jsr.io/@ursamu/mush) —
drafts, reply/forward, folders, attachments, quota, expiry, and a
REST API.

## Install

### JSR (recommended)

```ts
// deno.json
{
  "imports": {
    "@ursamu/mail": "jsr:@ursamu/mail@^2.4.0"
  }
}
```

Load via your game's plugin loader / `plugins.manifest.json`, or
import the default export and register it with the engine.

```ts
import mailPlugin from "@ursamu/mail";
// engine.loadPlugin(mailPlugin) — or drop into plugins/
```

### plugins.manifest.json

```json
{
  "plugins": [{
    "name": "mail",
    "url": "https://github.com/UrsaMU/mail-plugin",
    "ref": "v2.4.0",
    "description": "In-game mail system.",
    "ursamu": ">=2.6.0"
  }]
}
```

Monorepo local override:

```json
{
  "name": "mail",
  "local": "../../packages/mail",
  "ursamu": ">=2.6.0"
}
```

## Peer dependencies

| Package | Role |
|---------|------|
| `@ursamu/mush` `^0.1.3` | Engine APIs (`addCmd`, DBO, hooks) |
| `@ursamu/help` `^0.1.2` | Help file directory registration |

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

All routes require auth. Base path: `/api/v1/mail`.

| Method | Path | Action |
|--------|------|--------|
| GET | `/` | Inbox (`?folder=trash`) |
| GET | `/sent` | Sent by caller |
| GET | `/:id` | Read (marks read) |
| POST | `/` | Send now |
| PATCH | `/:id` | `folder` / `starred` |
| DELETE | `/:id` | Soft trash or hard delete |

## Library API

```ts
import {
  mailDb,
  type IMail,
  getMyMail,
  countPlayerMail,
  MAIL_QUOTA,
} from "@ursamu/mail";
```

`IMail` is the shared message shape. Other plugins (e.g. CoFD
staff tools) may write the same collection without importing
mail internals.

## Events

Emits `mail:received` via `gameHooks` with
`{ to, from, subject, body }` when a message is delivered.

## Version

**2.4.0** — first monorepo JSR release of the in-tree package
(continues the external `mail-plugin` 2.x line).
