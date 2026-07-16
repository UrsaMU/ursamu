# @ursamu/help

API-first help system for UrsaMU — aggregates command inline help,
per-plugin `help/` folders, and runtime DB entries.

## Install

```bash
# via game plugins.manifest.json (recommended)
# or JSR:
deno add jsr:@ursamu/help
```

In `config/config.json`:

```json
{
  "server": {
    "plugins": ["@ursamu/help"]
  }
}
```

## In-game commands

| Command | Who | Purpose |
|---------|-----|---------|
| `help` | connected | Section / topic index |
| `help <topic>` | connected | Show a topic |
| `help/section <name>` | connected | List topics in a section |
| `+help/set <topic>=<text>` | admin+ | Create/update DB entry |
| `+help/del <topic>` | admin+ | Delete DB entry |
| `+help/reload` | admin+ | Bust file-provider cache |

## Layout chrome

Help output uses the same chrome as the rest of the game
(requires `@ursamu/mush` ≥ 0.1.1):

1. **`game.layout.header` / `.footer`** mushcode templates
2. **TinyMUX plushelp fallback** — plain 78-column dash rules

The index is header → section columns → footer (no mid-page
"SECTIONS" divider). Topic entries use the same header/footer.

```json
{
  "game": {
    "layout": {
      "header":  "[center(%ch%cy%0%cn,%1,%cg=%cn)]",
      "footer":  "[repeat(%cg=%cn,%1)]"
    }
  }
}
```

Without templates, topics look like TinyMUX `+help`:

```
------------------------------------------------------------------------------
MAIL
<body…>
------------------------------------------------------------------------------
```

## Plugin help directories

Register a plugin's `help/` folder from `init()`:

```ts
import { registerHelpDir } from "@ursamu/help";

// init():
registerHelpDir(
  new URL("./help", import.meta.url).pathname,
  "myplugin",
);
```

## REST API

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/api/v1/help` | no | Sections + topic list |
| GET | `/api/v1/help/:topic` | no | JSON entry |
| GET | `/api/v1/help/:topic?format=md` | no | Raw markdown |
| POST | `/api/v1/help/:topic` | admin JWT | Create/update |
| DELETE | `/api/v1/help/:topic` | admin JWT | Delete |

## Development

```bash
deno task test       # unit tests
deno task check      # type check
deno task preflight  # JSR dry-run
deno task publish    # publish to JSR (after preflight)
```
