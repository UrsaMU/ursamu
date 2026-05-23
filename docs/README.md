# UrsaMU Documentation (v2.6.0)

Welcome to the UrsaMU documentation. All pages are written in Markdown and
rendered by the Lume static-site generator — they also read cleanly directly
on GitHub.

## Navigation

- [Home](./index.md) — landing page, features, quick install
- [About](./about.md) — what UrsaMU is and how it compares to other MU* servers
- [MUSH Compatibility](./mush_compatibility.md) — TinyMUX 2.x parity matrix
- [Guides](./guides/) — installation, player, and admin guides
- [API Reference](./api/) — core, database, hooks, commands, formats
- [Configuration](./configuration/) — `config.json` shape and `JWT_SECRET`
- [Plugins](./plugins/) — plugin authoring and the v2.6.0 manifest format
- [Development](./development/) — pre-commit gauntlet, testing, contributing
- [LLM Reference](./llms.md) — machine-optimized API summary

## Building the Site Locally

```bash
deno task docs
```

This serves the site at `http://localhost:3000` with hot reload.
