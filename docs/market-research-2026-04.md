# UrsaMU Market Research — April 2026

## Market Size

- ~10,000 active players, ~722 games tracked on Mudstats
- Small, passionate, aging demographic — not a growth market
- Opportunity is consolidation: be the obvious modern choice so new games start on UrsaMU instead of a 30-year-old C codebase

---

## Pain Points (What's Driving People Away)

1. **Setup requires a coder** — spinning up a MUSH still means compiling C, editing flat-file configs, or knowing Deno. Non-technical storytellers can't self-serve.
2. **MUSHcode is a development hell** — no editor support, no linter, no version control, no tests. Bugs are found by players, not builders.
3. **No web client** — every modern player expects to open a URL. Requiring a MUD client (MUSHclient, Mudlet) is a hard filter that kills casual adoption.
4. **No package ecosystem** — every game reinvents jobs, bboards, chargen from scratch. No `npm install bbs`.
5. **No Discord integration** — ~70% of active MUSH communities already live in Discord. The game and the community are siloed.

---

## What People Want

- Zero-install web client (browser play, mobile-friendly)
- Discord bridge (relay game events ↔ Discord channels)
- OAuth login (Google/Discord — no more `connect name password`)
- Plugin marketplace / one-command installs
- REST API for web dashboards and bots
- Live dev feedback — the one thing classic engines do well that modern ones don't: type softcode, see output immediately

---

## The Gap UrsaMU Hasn't Closed Yet

Classic MUSH's irreplaceable advantage is the **in-game REPL** — `think add(1,2)` returns `3` instantly. Experienced builders live in that loop. UrsaMU has the softcode engine but no interactive eval surface exposed to builders in-game. That's the one capability keeping veterans from fully migrating.

---

## Competitive Landscape

- JS/TS MUSH engine space is underpopulated
- Ranvier targets combat MUDs, not RP-focused MUSH
- No direct competitor for "modern TypeScript MUSH engine with plugin ecosystem"

---

## Game Genres Active in the Community

- World of Darkness (WoD)
- Sci-fi / Star Trek
- Urban RP
- Tabletop RPG adaptations

---

## UrsaMU Status vs. Market Wants

| What they want | UrsaMU has it? |
|----------------|----------------|
| REST API | Yes |
| Plugin system | Yes |
| Discord hooks | Yes (gameHooks) |
| Softcode engine | Yes (TinyMUX 2.x) |
| Zero-install web client | No |
| In-game eval REPL (`think`) | No |

---

## Highest-Leverage Next Steps

1. **In-game `think`/eval command** — lets builders test softcode expressions live without writing files. Closes the biggest psychological barrier for veteran MUSHers.
2. **Zero-install web client** — removes the MUD client requirement entirely; opens the game to casual players.
