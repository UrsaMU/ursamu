# UrsaMU Documentation

Welcome to the UrsaMU documentation. All pages are written in Markdown and
rendered by the Lume static-site generator — they also read cleanly directly
on GitHub.

**Current pins (docs):** engine `@ursamu/mush@1.0.30`, CLI
`@ursamu/cli@0.1.2`, public FE `@ursamu/site`, staff FE `@ursamu/web`.

Visual system matches the product FE contracts:

- [`packages/site/design.md`](../packages/site/design.md) — public portal
- [`packages/web/design.md`](../packages/web/design.md) — staff console

## Navigation

- [Home](./index.md) — landing page, features, quick install
- [About](./about.md) — what UrsaMU is and how it compares to other MU* servers
- [MUSH Compatibility](./mush_compatibility.md) — TinyMUX 2.x parity matrix
- [Guides](./guides/) — installation, CLI, player, and admin guides
- [API Reference](./api/) — core, database, hooks, commands, formats
- [Configuration](./configuration/) — `config.json` shape and `JWT_SECRET`
- [Plugins](./plugins/) — plugin authoring and JSR packages
- [Development](./development/) — pre-commit gauntlet, testing, contributing
- [LLM Reference](./llms.md) — machine-optimized API summary

## Building the Site Locally

```bash
# from repo root
deno task docs
```

Serves at `http://localhost:3001/` (port 3000 is often taken).
Build only: `deno task docs:build` → `docs/_site/`.
