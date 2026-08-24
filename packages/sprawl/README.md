# @ursamu/sprawl-plugin

**Sprawl Goons: Upgraded (Carbon Edition)** — feature-complete
2d6 cyberpunk for UrsaMU.

Source: Geist Hack Games *Sprawl Goons: Upgraded* + Booster +
Plug-In + Metal Express (CC BY 4.0). Rule text in `books/sg.txt`.

> Do **not** load beside `@ursamu/cyberpunk-plugin` (shared command
> names: `+sheet`, `+roll`, `+chargen`, `+utf8`).

## Feature surface

| Domain | Coverage |
|--------|----------|
| Chargen | 4-pt stats, 32 backgrounds+edges, d66 belongings (expanded), cash, quirks, affectations, aug origin |
| Look | Cyberpunk street prose: d66 openers, live gear/ride weave, engine header/footer + tint |
| Dice | 2d6, Glitch/Upgrade cancel, exploding 6s, double-1 nerve |
| Combat | Mags, auto DoT, `+range`, Hollywood `+horde`, scene breaks, specialty, crit tables |
| Gear | Real Things; drones (`+drone` deploy/use); buy via `+gear` |
| Chrome | 47 augs, shardware, cyberlimb malfunction |
| Net | Fast Hack (Cog+RAM), consoles/slots/upgrades, software + demons, exploit bank, heat spawns, console war, paradox/AI, gigs |
| Chem | 11 narcotics, addiction DS, withdrawal table |
| Wheels | Chassis DS, vehicle crits on wreck, showroom, chase, mecha |
| City | 23 districts, 80 Flow locs, 28 antagonists, corps, lexicon |
| Progress | Mission credit / 100 AP / MISSION job close; `+scene` edge reset |

## Visual

CPR terminal chrome (78-wide cyan frames, yellow tags, magenta
labels). Sprawl **`>>`** is a sparse status accent, not every line.

## Quick start

```text
+chargen/list backgrounds   # catalog — no draft needed
+chargen/info nodejacker    # background + edge blurb
+chargen/start
+chargen/stat reaction=2
+chargen/stat cognition=1
+chargen/stat affinity=1
+chargen/background nodejacker
+chargen/belongings roll   ×3
+chargen/cash
+chargen/submit          # CGEN job + mail
# staff: +chargen/approve <name>
# staff: +staff/cash|/gear|/ap  +advance/ready
+sheet
inv
use yeheyuan
+attack 10
+console/buy hyperion
+hack 12
+gig · +gig/enter · +attack · +hack
+flow 1
+vehicle/showroom
+drug/catalog
```

### In-game help

`registerHelpDir(…, "sprawl")` — start at **`+help sprawl`**.

| Area | Topics |
|------|--------|
| Combat | `combat`, `combat/examples`, `combat/examples-npc`, `combat/examples-care` |
| Hack | `hack`, `hack/examples`, `hack/examples-war`, `hack/examples-soft`, `hack/war` |
| Gig | `gig`, `gig/party`, `gig/examples` |
| AI | `paradox`, `paradox/examples` |
| Staff | `staff`, `staff/grant`, `staff/advance`, `staff/ops` |

Help files follow ursamu-dev rules: ≤22 lines, ≤78 cols,
`SEE ALSO` links, example-heavy subtopics.

Carried gear is **UrsaMU Things** (`state.sprawl_item`) — not a
JSON array on the sheet. Stock verbs: `inv`, `use`, `get`,
`drop`, `give`. `+gear` is catalog/buy only.

## Showcases

In-process command previews (no live server):

```bash
cd packages/sprawl
deno task showcase --list
deno task showcase sg-chargen
deno task showcase --all
```

Flows: `sg-chargen`, `sg-sheet-rolls`, `sg-combat`,
`sg-gear`, `sg-vehicle`, `sg-hack`, `sg-flow`, `sg-desc`
(cover mags, DoT, drones, software, advance).

## Data files

Forty-six JSON tables under `data/` (slug-keyed, book page cites).
Catalog kinds: firearms, melee, armor, heavy, ammo, mods, drones,
augs, shards, consoles, exploits, narcotics, showroom, flow,
antagonists, market (250+ prices), lexicon, …

## REST

`GET /api/v1/sprawl/` · `/sheet/:id` ·
`/catalog/{firearms|melee|armor|heavy|augs|market|flow|narcotics|showroom|antagonists}`

## License

MIT (code). Setting/rules © Geist Hack Games — CC BY 4.0.
