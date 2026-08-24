# @ursamu/utopia

Week / feed / sphere crew play for [UrsaMU](https://github.com/ursamu/ursamu).
The engine judges. AI-GM is optional narration.

House news tables only — not a port of the Utopia RPG
rulebook lists.

## Smoke

```bash
cd games/utopia-local
deno task reset-db
deno task daemon
deno task smoke
```

## Install

Add the package to the game plugin list after `help`.
Optional: `@ursamu/ai-gm` — registers system `utopia`. After
`+act`, `+feed/tick`, and crew-ready, the city graph narrates
into the room. Numbers stay on the engine card.
Optional: install `packages/site/examples/themes/utopia/`
for the pinned /play deck.

## Commands

| Command | Who | What |
|---------|-----|------|
| `+feed` | players | City ticker |
| `+feed/tick` | staff | Advance the week |
| `+week/plan <text>` | players | One-sentence plan, lock DV |
| `+week/ready` | players | Mark ready |
| `+week` | players | Crew + plans |
| `+act <verb>` | players | Resolve an action |
| `+act/hitch <verb>` | players | Buy success (danger ≤ 4) |
| `+sphere` | players | Contacts and bills |

Dock chips on /play send `+week`, `+act take-job`,
`+act gather-information`, `+act hack`, `+act lay-low`.

## License

MIT. Setting loop inspired by Utopia (David Markiwsky);
tables and copy here are original.
