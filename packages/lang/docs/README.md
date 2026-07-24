# Documentation

Deeper documentation for the `ursamu-language-plugin`. For a quick
tour, start with the [project README](../README.md).

## Contents

| Document | What it covers |
|----------|----------------|
| [Installation](./installation.md) | Add the plugin to an UrsaMU game, first-boot expectations, removal. |
| [Architecture](./architecture.md) | Layered view, the bake step, the garble pipeline, why the design is the way it is. |
| [Commands](./commands.md) | Every in-game command and switch, with examples and error states. |
| [Authoring languages](./authoring-languages.md) | Field-by-field tour of `LangDef`, tuning tips, a worked Orcish example. |
| [Public API](./api.md) | Everything exported from `mod.ts` for use in other plugins. |
| [Troubleshooting](./troubleshooting.md) | Common failure modes on boot, in-game, and during development. |

## In-game help

The plugin also ships in-game help files under [`help/`](../help/):

- [`help/language.md`](../help/language.md) — `+help language` top-level entry.
- [`help/language-authoring.md`](../help/language-authoring.md) — author guide surfaced as `+help language-authoring`.
