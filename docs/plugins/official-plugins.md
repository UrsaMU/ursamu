---
layout: layout.vto
title: Official Plugins
description: The official UrsaMU plugin ecosystem — what each plugin provides, install requirements, and links to their documentation.
---

# Official Plugins

UrsaMU's official plugins live in the [UrsaMU GitHub organization](https://github.com/UrsaMU).
They are listed in `src/plugins/plugins.manifest.json` and installed automatically on first run via `ensurePlugins`.
---

## Auto-installation

On startup, the engine reads `plugins.manifest.json` and fetches any plugin whose `ref` differs from the installed copy. No manual install step is required.

To disable auto-install for a specific plugin, remove its entry from the manifest.
---

## Plugin Registry

| Plugin | Repo | Min Engine | Description |
|--------|------|-----------|-------------|
| **channel** | [UrsaMU/channel-plugin](https://github.com/UrsaMU/channel-plugin) | `>=1.9.27` | Channel system — alias dispatch, auto-join, `@chancreate`/`@chandestroy`/`@chanset`, message history |
| **discord** | [UrsaMU/discord-plugin](https://github.com/UrsaMU/discord-plugin) | `>=1.9.0` | Webhook-based Discord integration — channel bridging, presence, chargen events |
| **jobs** | [UrsaMU/jobs-plugin](https://github.com/UrsaMU/jobs-plugin) | `>=1.9.0` | Anomaly-style jobs/request system — player requests, staff commands, REST API |
| **events** | [UrsaMU/events-plugin](https://github.com/UrsaMU/events-plugin) | `>=1.9.2` | In-game event calendar with RSVP tracking and REST API |
| **bbs** | [UrsaMU/bbs-plugin](https://github.com/UrsaMU/bbs-plugin) | `>=1.9.0` | Myrddin-style bulletin boards — threading, categories, sticky posts, Discord webhooks |
| **wiki** | [UrsaMU/wiki-plugin](https://github.com/UrsaMU/wiki-plugin) | `>=1.9.0` | File-based markdown wiki — pages, search, history, backlinks |
| **mail** | [UrsaMU/mail-plugin](https://github.com/UrsaMU/mail-plugin) | `>=1.9.3` | In-game mail — drafts, reply/forward, folders, attachments, quota, REST API |
| **builder** | [UrsaMU/builder-plugin](https://github.com/UrsaMU/builder-plugin) | `>=1.9.5` | World-building commands — `@dig`, `@open`, `@link`, `@describe`, `@examine`, REST API |
| **chargen** | Bundled — `src/plugins/chargen/` | `>=1.8.0` | Character generation scaffolding — hooks into the connection flow to guide new players through stat selection |
| **help** | [UrsaMU/help-plugin](https://github.com/UrsaMU/help-plugin) | `>=1.9.0` | API-first help system — file + DB + command providers, `+help/set`/`+help/del`, REST API, per-plugin help dirs |
---

## Adding a Plugin

Any GitHub repo can be added to the manifest:

```json
{
  "plugins": [
    {
      "name": "my-plugin",
      "url": "https://github.com/example/my-plugin",
      "ref": "v1.0.0",
      "description": "What this plugin does.",
      "ursamu": ">=1.9.27"
    }
  ]
}
```

Or use the CLI:

```bash
deno run -A jsr:@ursamu/ursamu/cli plugin install https://github.com/example/my-plugin
```

See [Building a Plugin](./first-plugin.md) to publish your own.
