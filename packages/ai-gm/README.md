# @ursamu/ai-gm

Agentic AI Game Master for [UrsaMU](https://github.com/ursamu/ursamu). Drop game
books in a folder — the GM reads them, configures itself, and runs your
sessions.

## Requirements

- [UrsaMU](https://github.com/ursamu/ursamu) ≥ 1.5.7
- [Deno](https://deno.land) ≥ 1.41
- [Google AI API key](https://ai.google.dev) (Gemini Flash)
- _(Optional)_ Stripe account for monetization
- _(Optional)_ Discord webhook URL for channel mirroring

## Install

```bash
ursamu plugin install jsr:@ursamu/ai-gm
```

Copy `.env.example` → `.env` and set `GOOGLE_API_KEY`. The plugin loads it
automatically.

## Quick Start

```
# In-game (staff only)
+gm/watch                            — watch the current room
+gm/ingest                           — trigger book ingestion
+gm/ingest/approve <jobId>           — activate the ingested system
+gm/session/open <label>             — open a session and start playing
```

Players pose normally. The GM responds when all players in the room have posed.

## Documentation

| Topic                                  |                                                |
| -------------------------------------- | ---------------------------------------------- |
| All commands                           | [docs/commands.md](docs/commands.md)           |
| Environment variables & in-game config | [docs/configuration.md](docs/configuration.md) |
| Book ingestion walkthrough             | [docs/ingestion.md](docs/ingestion.md)         |
| Credits, subscriptions, Stripe setup   | [docs/monetization.md](docs/monetization.md)   |
| REST API                               | [docs/rest-api.md](docs/rest-api.md)           |
| File layout & LangGraph flow           | [docs/architecture.md](docs/architecture.md)   |
| Security mitigations                   | [docs/security.md](docs/security.md)           |
| Plugin bridge (shadowrun & peers)      | [docs/bridge.md](docs/bridge.md)               |

## Development

```bash
deno task test    # 126 tests
deno task check   # type-check
deno task lint
```

## License

MIT — Copyright (c) 2026 Lemuel Canady, Jr.
