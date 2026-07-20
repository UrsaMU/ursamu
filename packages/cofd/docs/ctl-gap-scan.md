# CtL 2e gap scan (vs `books/ctl.txt` + shipped code)

Scan date: 2026-07-17. Scope: CoFD plugin changeling overlay.
Book reference: Changeling: The Lost 2e (`packages/cofd/books/ctl.txt`).

## Shipped (playable v1)

| Book topic | Implementation |
|------------|----------------|
| Seeming / Kith / Court / Needle / Thread | Chargen + sheet (`changeling.json`) |
| Wyrd / Glamour / Clarity track | Sheet energy + morality; integrity engine |
| Mask / mien / Chrysalis | `+shift` |
| Contracts (catalog + invoke) | `+contract`, contracts JSON |
| Portaling / Hedgeways | `+hedge/open|exit|link`, season free-open |
| Key phrases on gates | `+hedge/setway …/key=` + `open name=phrase` |
| Dual look (fae) | `fae` flag, maskName, FAEDESC, way names |
| Hedge navigation chase | `+hedge/travel` |
| Trods / Thorns danger | Room `danger` + nav pools |
| Goblin fruit | Catalog, objects, forage, eat |
| Goblin Markets / Debt | `+market`, `+debt` |
| Icons | `+icon` (grant/spend/recover; simplified surge) |
| Hedgespinning | `+spin` (catalog effects; path → nav +2) |
| Hollow Merit | Claim, rating budget, enhancements, escape, easy-access |
| Goblin Debt (market credit) | Sheet `hedgeState.debts` |

## Partial / simplified

| Topic | Gap |
|-------|-----|
| **Icons** | Spend = Glamour surge + Clarity-condition resolve note; full recovery scenes still ST |
| **Hedgespinning** | No full Subtle vs Paradigm Shift tables; no contested spin vs Hedge |
| **Hollow** | Hob Alarm: room cue + Spooked on non-owner enter (no NPC spawn). Luxury Goods, Route Zero, Hidden Entry still open |
| **Mantle / Court Goodwill** | Tracked as Merits; court Contracts gated (partial) |
| **Goblin Contracts** | Debt-on-learn (+1 Goblin Debt) shipped; story Debt spiral still open |
| **Tokens / Hedgespun** | Market sells simplified tokens; no full Token creation / Master’s Keys |
| **Fruit catalog** | Subset of book fruits (common, Amaranthine, Peach, Liar’s Apple, …) |
| **Clarity Conditions** | Breakpoint catalog + auto-apply on Clarity loss (simplified) |
| **Kenning** | `+kenning` / `+kenning <target>` (Wits+Wyrd tiers) |

## Not implemented (next tiers)

| Topic | Book | Notes |
|-------|------|-------|
| **Pledges** (sealing, oaths, bargains) | p.209+ | Major social/fae system |
| **Oneiromancy** / Bastions / Dreaming Roads | p.215+ | Dream travel + weaving |
| **Fetches** (build, Echoes, story modes) | p.233+ | Adversary / other half |
| **Huntsmen** (Dread Powers, hunt loop) | p.262+ | Antagonist automation |
| **Hedge ghosts / hobgoblins** full | Ch.5 | NPC templates partial via `npcs/` |
| **Freehold / Court politics** | Ch.5–6 | RP / staff |
| **Bedlam** | p.110 | Power not automated |
| **Paradigm Shifts** (Hedge & dream) | p.206, 219 | Spin covers only subtle-ish effects |
| **Stable Trod Merit** | Merits | Not a Merit command |
| **Goblin Queen / Debt spiral** | Setting | Story |
| **True Fae / Titles** | Setting | Story |
| **Werewolf crossover** | — | Perception #6 forsaken later |

## Recommended next work (priority)

1. **Pledges** — seal / oath / bargain commands + Wyrd enforcement hooks  
2. **Mantle** Merit + court Contract prereqs  
3. **Tokens** as gear objects with catch/activation  
4. **Oneiromancy** light: enter Bastion, dreamweave slots  
5. **Fetch** sheet template + Echoes stubs  

## Command quick map (CtL)

```
+cg / +sheet / +shift / +contract / +kenning
+hedge  +hedge/hollow  +hedge/escape  +hedge/access
+market  +debt  +icon  +spin
help perception  (fae dual look)
help kenning
```
