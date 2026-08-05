# Cyberpunk RED Plugin — Implementation Plan

Status legend: ✅ Done  ⚠️ Partial  🔲 Not started  🚫 Deferred

---

## Phase 1 — Foundation (Complete)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Character stats (10 STATs, derived HP/HUM) | chargen.ts, chargen-steps.ts | ✅ | Lifepath + complete packages |
| Skills (45+, DV system, crits) | chargen.ts, rolls.ts | ✅ | |
| Character sheet | commands/sheet.ts | ✅ | |
| Look / desc | commands/look.ts | ✅ | |
| Wound states & critical injuries | commands/wounds.ts, engine/combat.ts | ✅ | |
| Death save | engine/combat.ts | ✅ | |
| HP / SW threshold | engine/combat.ts | ✅ | |
| Rest & recovery | commands/rest.ts, engine/rest.ts | ✅ | |
| Humanity tracking | commands/humanity.ts, engine/humanity.ts | ✅ | |
| Cyberpsychosis | engine/cyberpsychosis.ts | ✅ | |
| Therapy | commands/therapy.ts | ✅ | |
| Admin tools | commands/admin.ts | ✅ | |

---

## Phase 2 — Combat (Complete)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Initiative (REF + 1d10) | engine/combat.ts | ✅ | |
| Ranged combat (attack/defense/damage) | commands/combat.ts | ✅ | |
| Melee combat | commands/combat.ts | ✅ | |
| Brawling (grab, choke, disarm, pin) | commands/brawl.ts | ✅ | |
| Armor & SP damage | engine/combat.ts | ✅ | |
| FNFF (Full Auto / suppressive fire) | commands/fnff.ts, engine/fnff.ts | ✅ | |
| Called shots / aimed shots | commands/combat.ts | ✅ | |
| Environment effects | commands/environment.ts | ✅ | |

---

## Phase 3 — Roles & Progression (Complete)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Role abilities (all 10 roles) | commands/roles.ts | ✅ | |
| Skill improvement / XP | commands/improve.ts | ✅ | |
| Reputation & Facedown | commands/reputation.ts | ✅ | |

---

## Phase 4 — Cyberware & Body Modification (Complete)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Cyberware install/remove | commands/cyberware.ts | ✅ | Bring-your-own-chrome supported |
| Bodysculpt | commands/bodysculpt.ts | ✅ | |
| Chopshop (ripperdoc queues) | commands/chopshop.ts, commands/chopshop-shop.ts | ✅ | |
| Rank-based queue capacity | engine/roleCapacity.ts | ✅ | |

---

## Phase 5 — Economy & Markets (Complete)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Eurodollars (EB), pay | commands/economy.ts | ✅ | +eb/pay |
| Lifestyle tiers | commands/economy.ts | ✅ | +lifestyle |
| Night Market (open/sell/buy/haggle) | commands/market.ts | ✅ | |
| Market browse + area view | commands/market-browse.ts | ✅ | |
| Sort/filter (+market/all) | commands/market-browse.ts | ✅ | |
| Consignment (Tech → Fixer stall) | commands/market-consign.ts | ✅ | |
| Stall locks (lock expressions) | commands/market.ts, market-browse.ts | ✅ | |
| Established vs timed vendors | commands/market.ts | ✅ | u.canEdit mechanic |
| Midnight Market (rank 9+) | commands/market.ts | ✅ | |
| Auto-stock on open | engine/market.ts | ✅ | Tier-based random items |
| Rank-based market capacity | engine/roleCapacity.ts | ✅ | |
| Scrap (gear → EB) | commands/scrap.ts | ✅ | Workshop-locked |
| Drugs / pharma | commands/pharma.ts | ✅ | |
| Gear management | commands/gear.ts | ✅ | |
| Armor management | commands/armor.ts | ✅ | |
| Crafting (Tech invention/fabrication) | commands/crafting.ts, engine/crafting.ts | ✅ | |
| Jobs board | commands/jobs.ts | ✅ | |

---

## Phase 6 — Netrunning (Partial)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| NET architecture navigation | commands/netrunning.ts, engine/netrunning.ts | ⚠️ | Needs full review vs rulebook |
| Cyberdeck / programs | commands/netrunning.ts | ⚠️ | |
| Black ICE (15+ types) | engine/netrunning.ts | ⚠️ | |
| NET combat (program vs ICE) | engine/netrunning.ts | ⚠️ | |
| Jack in / jack out (safe vs unsafe) | commands/netrunning.ts | ⚠️ | |
| Slide ability (evade Black ICE) | engine/netrunning.ts | ⚠️ | |
| REZ damage system | engine/netrunning.ts | ⚠️ | |

**Action:** Full audit of netrunning against rulebook pp. 195–216. This is the biggest incomplete system.

---

## Phase 7 — Nomad Pack System (Partial)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Pack cohesion / Nomad family | commands/pack.ts, engine/pack.ts | ⚠️ | Needs review |
| Vehicle ownership & upgrades | — | 🔲 | Not started |
| Vehicle combat (chase, ramming, mounted weapons) | — | 🔲 | Own subsystem |
| Vehicle database (cars, bikes, AVs, boats) | — | 🔲 | |

---

## Phase 8 — Economy Round-Out (Next Up)

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Tech offline workshop (+bench) | — | 🔲 | Permanent object in room; EB pays owner offline |
| Repair (+repair) | — | 🔲 | Weapons/armor SP restoration; requires +bench in room |
| Fixer sourcing roll (Operator) | — | 🔲 | Roll to find unlisted items; black_market_contacts gates access |
| Buy orders / wanted list (+market/want) | — | 🔲 | Notify buyer when matching listing posted |
| Role passive income | — | 🔲 | Exec salary, Rockerboy royalties, Netrunner data fees |
| Trauma Team response | — | 🔲 | Card purchased → TT team dispatches on near-death trigger |

---

## Phase 9 — Social & Faction Systems

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Contacts system | — | 🔲 | NPC contact objects; Fixer/Exec call for favors; black_market_contacts skill |
| Lawman backup call | — | 🔲 | Rank-gated NPC response team |
| Exec team / NPC followers | — | 🔲 | Teamwork ability; loyalty mechanic |
| Rockerboy crowd influence | — | 🔲 | Charismatic Impact; audience mechanics |
| Media credibility (Credibility ability) | — | 🔲 | News propagation, info access |
| Safe houses / player properties | — | 🔲 | Lifestyle-linked housing objects |

---

## Phase 10 — GM & World Tools

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Scream Sheets (in-world news / BB) | — | 🚫 Deferred | Staff post headlines; player-submit with approval; CPR-flavor bulletin board |
| In-game mail system | — | 🚫 Deferred | CPR-flavored delivery; needed for offline payouts, buy-order alerts |
| Mook / NPC generator | — | 🔲 | Quick NPC stat blocks from template (gang, corpo, etc.) |
| Encounter / Beat chart tools | — | 🔲 | Scene structure, encounter scaling |
| Tarot mechanic | — | 🔲 | Optional fate mechanic; GM draws cards to set scene tone |

---

## Phase 11 — Quality of Life

| System | File(s) | Status | Notes |
|--------|---------|--------|-------|
| Scavenge | commands/scavenge.ts | ✅ | |
| GM bridge / emitters | engine/gm-bridge.ts, engine/emitters.ts | ⚠️ | Known type errors; needs cleanup |
| Help files (all commands) | help/ | ⚠️ | Needs audit — verify every command has a help file |
| Showcases (all systems) | showcases/ | ⚠️ | Add showcases for Phase 6–10 systems as built |

---

## Rulebook Coverage Gaps (from pp. 195–384 scan)

Systems in the rulebook with no implementation planned yet:

| System | Rulebook ref | Notes |
|--------|-------------|-------|
| Clothing / fashion stats | p. 327 | Social/rep modifier from appearance |
| Complementary skills | p. 128 | One skill bonus to another check |
| Taking extra time bonus | p. 129 | Spend extra time for +1 to check |
| Agent (personal AI assistant) | p. 319 | In-world information/commerce interface |
| Data Pool / Data Terms | p. 319 | Public NET access terminals |
| Cyberware Addiction (Cyberpsychosis recovery arc) | p. 230 | Therapy arc to full recovery |

---

## Dependency Map (build order for Phase 8+)

```
+bench/open  →  +repair
+market/want  →  (notify hook when listing posted)
Contacts  →  Fixer sourcing roll
Vehicle DB  →  Vehicle combat
Scream Sheets  →  (deferred, needs in-game mail first)
```
