# CtL 2e gap scan (vs CtL 2e core text + shipped code)

**Scan date:** 2026-07-21  
**Scope:** CoFD plugin Changeling: The Lost overlay  
**Book:** Changeling: The Lost 2e (local extract only; not in package)

This file is the living status board for Lost support. Update it when
shipping CtL features.

---

## Summary

| Layer | Status |
|-------|--------|
| **Identity & chargen** | Shipped |
| **Core Lost powers** (Mask, Contracts, Glamour, Clarity) | Shipped |
| **Hedge loop** (travel, fruit, Hollow, market, spin) | Shipped |
| **Social fae** (pledges, kenning, dual look) | Shipped |
| **Glamour economy & Bedlam** | Shipped (2026-07) |
| **Merits catalog (Mantle, Hollow, …)** | Shipped (2026-07) |
| **Dreams (oneiromancy / Bastions)** | **Shipped light** (`+dream`) |
| **Fetches (build, Echoes, link)** | **Shipped light** (`+fetch`) |
| **Huntsman hunt loop** | **Shipped light** (`+hunt`) |
| **Contract effect hooks** | **Shipped light** (Conditions/Tilts from text) |
| **Dream Roads map** | **Shipped light** (`+dream/travel`, paradigm weaves) |
| **Hollow polish** | **Shipped** (Hidden Entry, Shadow Garden) |
| **Mantle high-dot** | **Shipped light** (debt/clarity/armor/agg/winter) |
| **Hobgoblins** | **Shipped light** (`+hob`, NPC trader) |

**Bottom line:** Lost is a **playable chronicle overlay**. Players can
chargen, shift, invoke Contracts, travel the Hedge, market, pledge,
harvest, bedlam, spin, dreamwalk Bastions, run fetches/Echoes, face
the Wild Hunt, and get Mantle dice on rolls. Still open: full dream
paradigm tables, True Fae, Contract effect automation, Mantle high-dot
effects, Huntsman heart-Bastion cycle.

---


### Recently completed (hollow + mantle high + hob)

18. **Hidden Entry** — gate vanishes when owners inside; +hedge/find −2  
19. **Shadow Garden** — eaten fruit queues; +hedge/garden harvest  
20. **Mantle high-dot** — debt wipe, clarity convert, summer agg/armor,
    autumn contract discount, winter wound ignore  
21. **Hobgoblins** — +hob/create, concepts, Dread Powers; NPC trader  

## Shipped (playable)

| Book topic | Implementation |
|------------|----------------|
| Seeming / Kith / Court / Needle / Thread | Chargen + sheet (`changeling.json`) |
| Wyrd / Glamour / Clarity track | Sheet energy + morality; integrity engine |
| Mask / mien / Chrysalis | `+shift` |
| Contracts (catalog + invoke) | `+contract`, `/loophole`, seeming clauses, Mantle in pools |
| Clash of Wills | `+clash` |
| Portaling / Hedgeways | `+hedge/open\|exit\|link`, season free-open |
| Key phrases on gates | `+hedge/setway …/key=` + `open name=phrase` |
| Dual look (fae) | `fae` flag, maskName, FAEDESC, way names |
| Hedge navigation chase | `+hedge/travel` (+ Stable Trod, spinEdge) |
| Trods / Thorns danger | Room `danger` + nav pools |
| Goblin fruit | Core book fruits, objects, forage, eat |
| Goblin Markets / Debt | `+market`, `+debt` (expanded stalls) |
| Icons | `+icon` spend clears Clarity Cond; recover +Beat |
| Hedgespinning | `+spin` subtle + paradigm (Hedge contests) |
| Hollow Merit | Claim, budget, escape, access, route, luxury, hob-alarm |
| Goblin Debt (market credit) | Sheet `hedgeState.debts` |
| Pledges | `+pledge` seal/oath/bargain |
| Tokens | `+gear/token` create/activate/catch + rating surge |
| Glamour harvest / reap | `+harvest`, `+harvest/reap`, `+reap` |
| Incite Bedlam | `+bedlam` room contest + court emotions |
| Frailties / cold iron | `+frailty`; iron → aggravated in combat |
| Mantle / Court Goodwill / Hollow merits | `merits.json` + contract learn prereqs |
| Acute Senses / Pandemoniacal | Merit catalog; perception / Bedlam dice |
| Kenning | `+kenning` / `+kenning <target>` |
| Oneiromancy / Bastions (light) | `+dream` Ivory/Horn, enter, weave, wake |
| Fetches / Echoes (light) | `+fetch` create/link, Echo activate; NPC `fetch-double` |
| Wild Hunt / Huntsman (light) | `+hunt` mark/track/powers; NPC `huntsman` |
| Mantle seasonal dice | Auto on +roll; `+mantle` status/glamour |

### Recently completed (2026-07 partial-systems pass)

Finished systems that were previously “partial / simplified”:

1. Contract loopholes + seeming-clause display + Mantle dice trait  
2. Clash of Wills command  
3. Harvest / reap Glamour economy  
4. Incite Bedlam  
5. Frailty list + cold iron notes  
6. Hedgespinning paradigm shifts (Hedge contests)  
7. Hollow Route Zero + Luxury Goods commands  
8. Icon spend/recover depth  
9. Token activation surge  
10. CtL merits in `merits.json`  
11. Market catalog expansion (core fruits + sample tokens)  



### Recently completed (contract hooks + roads)

16. **Contract effect hooks** — parse effect text for Conditions/Tilts;
    auto-apply on success; `+contract Name on Target`  
17. **Dreaming Roads** — room graph (`+dream/road`, `/link`,
    `/travel`); expanded subtle + paradigm weave catalog  

### Recently completed (2026-07 huntsman + mantle)

14. **Wild Hunt light** — mark quarry, track stages, Huntsman
    Dread Powers, Kindred Spirits readout, NPC `huntsman`  
15. **Mantle seasonal dice** — auto bonuses on +roll by court;
    `+mantle` status and scene Glamour claim  

### Recently completed (2026-07 oneiromancy + fetch)

12. **Oneiromancy light** — Gate of Ivory/Horn, dream form
    (Power/Finesse/Resistance, Dream Health), enter other Bastions
    vs Fortification, dreamweave catalog, wake/forced wake  
13. **Fetches light** — `fetch` template, build from changeling,
    link sheets, Echo catalog + activate (Normalcy gate, Mimic
    requires met), story modes, NPC archetype `fetch-double`  

---

## Partial / simplified (remaining polish)

These exist but are not full book depth:

| Topic | What’s left |
|-------|-------------|
| **Contract effects** | Named Conditions/Tilts auto-apply; complex effects still ST |
| **Mantle remaining bullets** | Some mid-dot social still ST; story timing is simplified |
| **Token sample powers** | Rating surge + catch/drawback; Soul-Compass / Seeing Stone still ST flavor |
| **Phantom Phone** | Catalogued; RP/ST only |
| **Clarity attack tables** | Breakpoint Conditions auto on loss; full attack dice tables ST |
| **Fruit / oddments** | Core named fruits; not every oddment variant |
| **Pledge sanctions** | Structure shipped; sanction parse is light (bashing/lethal/WP text) |
| **Goblin Debt spiral** | Track + call/pay; Queen spiral is story |
| **Dream paradigm tables** | Expanded subtle+paradigm weaves; full book cost table still ST |
| **Dreaming Roads map** | Room graph + travel; no random generation |
| **Fetch Echo automation** | Costs + flags; combat Edge/zone effects still ST |
| **Fetch chargen** | Template exists; not a full +cg path (staff build/link) |

---

## Not implemented (next tiers)

| Topic | Book | Notes |
|-------|------|-------|
| **Huntsman heart Bastion** | p.264 | Destroy heart to stop reform — ST |
| **Hedge ghosts / hobgoblins** full | Ch.5 | Sparse NPC templates |
| **Freehold / Court politics** | Ch.5–6 | RP / staff |
| **Crown of Seasons** | p.164+ | Seasonal crown powers |
| **True Fae / Titles / Keepers** | Setting | Story |
| **Privateers / Bridge-Burners / Loyal** | Ch.5 | Setting |
| **Werewolf crossover perception** | — | Later |

---

## Recommended next work (priority)

1. **Huntsman heart Bastion** — destroy heart to end reform cycle  
2. **True Fae / Titles** light stubs  
3. **Phantom Phone** Hollow enhancement automation  
4. **Goblin Debt spiral / Queen** story hooks  
5. **Fetch chargen** full +cg path  

---

## Command quick map (CtL)

```
Identity / sheet
  +cg  +sheet  +shift  +frailty  +kenning

Powers
  +contract  +contract/loophole  +clash  +bedlam
  +icon  +spin  +gear/token  +pledge

Glamour
  +harvest  +harvest/reap  +reap

Dreams & doubles
  +dream  +dream/ivory  +dream/horn  +dream/weave  +dream/travel
  +fetch  +fetch/echo  +fetch/create
  +hunt   +hunt/track  +hunt/power
  +mantle +mantle/glamour

Hedge
  +hedge  +hedge/hollow  +hedge/garden  +hedge/find
  +hob    +hob/create  +hob/power
  +hedge/route  +hedge/luxury  +hedge/travel  +hedge/forage
  +market  +debt

Help
  help changeling  help dream  help fetch  help hunt  help mantle
  help harvest  help bedlam  help clash  help hedge
```

In-game map: `help changeling`.  
Package overview: `packages/cofd/README.md`.
