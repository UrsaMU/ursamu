# Commands Reference

All commands use the UrsaMU `+` prefix and are available to `connected` players unless noted.

**Table of Contents**
- [Character](#character)
- [Combat](#combat)
- [Wounds & Health](#wounds--health)
- [Economy](#economy)
- [Roles](#roles)
- [Cyberware & Armor](#cyberware--armor)
- [Netrunning](#netrunning)
- [Tech Maker (Crafting)](#tech-maker-crafting)
- [Night Markets](#night-markets-fixer-operator)
- [Chop Shop](#chop-shop)
- [Bodysculpting](#bodysculpting)
- [Pharmaceuticals](#pharmaceuticals)
- [Therapy](#therapy)
- [Gigs Board](#gigs-board)
- [Scavenging](#scavenging)
- [Admin](#admin)

---

## Character

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+sheet` | `+sheet[/switch]` | connected | View character sheet |
| `+score` | `+score [<player>]` | connected | Quick combat vitals strip |
| `+chargen` | `+chargen[/switch] [arg]` | connected | Character generation wizard |

### +sheet switches

| Switch | Shows |
|--------|-------|
| `/stats` | All 10 stats with current values |
| `/skills` | Full skill list with ranks |
| `/cyber` | Installed cyberware and Humanity Loss |
| `/wounds` | HP, wound state, critical injuries |
| `/rep` | Reputation score and recent deeds |
| `/lifepath` | Lifepath fields (background, style, etc.) |
| `/gear` | Weapons, armor, carried items |

### +chargen switches

| Switch | Action |
|--------|--------|
| `/method` | Choose `streetrat` or `complete` |
| `/role <role>` | Pick one of the 10 CPR roles |
| `/roll [<stage>] [<n>]` | Auto-roll or designate any lifepath table result |
| `/detail <stage> <n>` | Show full entry with mechanical notes (read-only) |
| `/next` | Advance to the next lifepath or chargen stage |
| `/stat <stat>=<value>` | Allocate a stat point (complete method only) |
| `/skill <skill>=<value>` | Allocate a skill point |
| `/set <field>=<value>` | Manually set a lifepath field |
| `/lifestyle <tier>` | Choose starting lifestyle tier |
| `/chrome <list\|name>` | Browse or install starting cyberware (spaces ok: `neural link`) |
| `/gear <list\|name>` | Browse or add starting weapons and armor (spaces ok: `heavy pistol`) |
| `/done` | Finalise and lock the character |
| `/reset <name>` | (Wizard+) Wipe draft **or approved** sheet |
| `+cprreset` / `+wipe` | Same wipe (short staff cmds) |

### +chargen/roll stage aliases

`/roll` and `/detail` accept a stage name before the number. You can roll any lifepath table at any stage of chargen — results are always saved.

| Alias | Also accepts | Stage |
|-------|-------------|-------|
| `origin` | `cultural` | Cultural Origin |
| `appearance` | `personality`, `look` | Personality & Style |
| `goals` | `motivations`, `values` | Motivations |
| `background` | `family` | Family Background |
| `allies` | `friends` | Friends |
| `foes` | `enemies` | Enemies |
| `history` | `events` | Life Events |
| `defining` | `role` | Role Events |

**Examples:**

```
+chargen/roll                     Auto-roll current stage
+chargen/roll origin 3            Designate cultural origin roll 3
+chargen/roll appearance          Auto-roll personality, style, and hair
+chargen/roll enemies 7           Designate WHO roll 7 (cause/resources auto-roll)
+chargen/detail enemies 8         Full entry: Corporate exec / Romantic rivalry / Gang lord
+chargen/detail history 5         Full entry: Crossed a corporation -- they haven't forgotten
```

### Enemies roll flow

The enemies stage uses a two-phase roll. The count roll comes first; subsequent rolls generate individual enemies.

```
+chargen/roll        →  roll 1d10-7 for count (e.g. result 9 = 2 enemies)
+chargen/roll        →  enemy 1: WHO + CAUSE + RESOURCES all rolled
+chargen/roll        →  enemy 2: WHO + CAUSE + RESOURCES all rolled
                        "All enemies rolled. +chargen/next to continue."
```

---

## Combat

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+init` | `+init [modifier]` | connected | Roll initiative, join combat tracker |
| `+attack` | `+attack[/mode] <target> [with <weapon>]` | connected | Make an attack |
| `+pass` | `+pass` | connected | Pass your turn |
| `+combat` | `+combat[/queue\|log\|end]` | connected | View/manage combat tracker |
| `+roll` | `+roll <expression>` | connected | Dice roller (skill checks, plain dice) |
| `+luck` | `+luck [points]` | connected | Manage Luck pool |

### +attack modes

| Mode | Effect |
|------|--------|
| `/aimed` | −8 to hit, ×2 damage on hit |
| `/auto` | Autofire burst, +2 to hit, targets DV by range |
| `/melee` | Uses DEX + Brawling or Melee Weapon skill |

### +combat switches

| Switch | Action |
|--------|--------|
| *(none)* or `/queue` | Display current initiative order with active marker |
| `/log` | Show last 20 combat log entries |
| `/end` | End the combat (initiator or admin only) |

### Combat flow

```
1. Staff: +npc/build Razor=boosterganger   →  AI street thug
2. All PCs run +init  →  tracker; room NPCs auto-join
3. +combat/queue               →  see initiative order
4. Active combatant acts:
     +attack <target>          →  ranged (ends turn; NPCs AI)
     +attack/melee <target>    →  melee
     +pass                     →  skip; NPCs resolve via walker
5. +combat/end                 →  close the tracker when done
```

### +npc (street antagonists)

| Switch | Who | Effect |
|--------|-----|--------|
| `/list` | all | NPCs in room |
| `/templates` | all | Archetype catalog |
| `/build <name>=<arch>` | staff | Spawn with AI (`aggressive`) |
| `/show <name>` | all | Stat block |
| `/ai <name>=<key>` | staff | Set walker brain |
| `/destroy <name>` | staff | Remove |

Archetypes: `boosterganger`, `security_operative`, `netrunner`,
`security_officer`, `pyro`. AI keys: `aggressive` (default),
`manual`/`off`, `llm`/`ai-gm`.

Wound state penalties apply automatically: Seriously Wounded −2 to all actions, Mortally Wounded −4.

---

## Wounds & Health

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+wound` | `+wound <target> <damage> [head\|body]` | admin+ | Apply damage |
| `+crit` | `+crit [head\|body]` | connected | Roll critical injury on yourself |
| `+deathsave` | `+deathsave` | connected | Death save when mortally wounded |
| `+stabilize` | `+stabilize <target>` | connected | First Aid/Paramedic check |
| `+heal` | `+heal [target] [amount]` | connected | Apply healing |

### Wound states

| State | HP range | Action penalty | Move penalty |
|-------|----------|---------------|-------------|
| Healthy | max HP | 0 | 0 |
| Lightly Wounded | SW threshold → max−1 | 0 | 0 |
| Seriously Wounded | 1 → SW threshold−1 | −2 | −6 |
| Mortally Wounded | 0 | −4 | −6 |
| Dead | — | — | — |

SW threshold = ⌈max HP / 2⌉

### Death save

Roll 1d10 at the start of each turn while Mortally Wounded. Must roll ≤ (BODY − death save penalties). Accumulated critical injury penalties stack.

### +stabilize

Requires First Aid or Paramedic skill. Roll TECH + skill vs DV:

| Skill | DV |
|-------|----|
| First Aid | 15 |
| Paramedic | 13 |

Success stops death saves for 1 hour. You **cannot stabilize yourself** (CPR core rules, p. 227).

---

## Economy

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+eb` | `+eb[/pay\|give\|receive] [args]` | connected | Eurodollar management |
| `+lifestyle` | `+lifestyle[/view\|set\|pay] [tier]` | connected | Monthly lifestyle billing |
| `+drug` | `+drug[/list\|active\|use\|purge] [name]` | connected | Pharmaceutical drugs |
| `+rep` | `+rep[/view\|deed\|add] [args]` | connected | Reputation tracking |
| `+facedown` | `+facedown <target>` | connected | Reputation facedown |

### +eb switches

| Switch | Syntax | Notes |
|--------|--------|-------|
| *(none)* | `+eb` | View your current EB balance |
| `/pay` | `+eb/pay <target>=<amount>` | Pay another player (room-local) |
| `/give` | `+eb/give <target>=<amount>` | Admin: give EB to any player |
| `/receive` | `+eb/receive <amount>` | Admin: add EB to yourself |

All amounts must be positive integers. Negative amounts are rejected.

### Lifestyle tiers

| Tier | Monthly cost (eb) |
|------|------------------|
| `kibble` | 10 |
| `streetrat` | 100 |
| `good_prepak` | 500 |
| `moderate` | 1,000 |
| `corporate` | 5,000 |
| `luxury` | 10,000 |

### +drug switches

| Switch | Action |
|--------|--------|
| `/list` | List all available pharmaceutical drugs |
| `/active` | Show currently active drug effects |
| `/use <name>` | Apply a drug effect |
| `/purge` | Remove all active drug effects |

### Facedown

`+facedown <target>` — Contest REP scores. Higher REP wins; ties go to the initiator. Loser loses 1 REP.

---

## Roles

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+role` | `+role[/info\|ability\|rank\|level] [args]` | connected | Role abilities and info |

Covers all 10 CPR roles:

| Role | Special Ability |
|------|----------------|
| Rockerboy | Charismatic Impact |
| Solo | Combat Awareness |
| Netrunner | Interface |
| Tech | Maker |
| Medtech | Medicine / Surgery |
| Media | Credibility |
| Exec | Teamwork |
| Lawman | Backup |
| Fixer | Operator |
| Nomad | Moto |

---

## Cyberware & Armor

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+cyber` | `+cyber[/list\|view\|install\|remove] [name]` | connected | Cyberware management |
| `+armor` | `+armor[/list\|view\|wear\|remove\|repair] [name]` | connected | Armor management |

### Cyberware

Installing cyberware deducts Humanity Loss (HL) and recalculates current EMP:

```
Current EMP = EMP_base − floor(total_HL / 10)
```

When EMP drops to 0, the character enters Cyberpsychosis. The `cpr:cyberpsychosis:threshold` hook fires at configurable HL thresholds.

### Armor

Armor has SP (stopping power) that ablates by 1 on each hit. Use `+armor/repair` to restore SP.

| Slot | Field |
|------|-------|
| Body | `armorBody` |
| Head | `armorHead` |

---

## Netrunning

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+netrun` | `+netrun[/jack\|jack_out\|status\|action\|programs\|build]` | connected | Netrunning system |

### Interface abilities

| Ability | Effect |
|---------|--------|
| Backdoor | Bypass password/ICE |
| Slide | Move without triggering ICE |
| Virus | Plant malicious code |
| Cloak | Mask Netrunner from detection |
| Zap | Stun ICE temporarily |
| Control | Take control of a device/program |
| Eye-Dee | Identify ICE or program |
| Pathfinder | Reveal NET architecture layout |
| Speakeasy | Communicate encrypted through NET |
| Worm | Slow-burn data destruction |
| Brain Dance | Trap target in sensory loop |
| Hellbolt | Direct damage to another Netrunner |
| Banhammer | Force another Netrunner offline |
| Sword | Direct damage to ICE |

### +netrun switches

| Switch | Action |
|--------|--------|
| `/jack` | Jack into local NET architecture |
| `/jack_out` | Exit the NET safely |
| `/status` | View current floor and active programs |
| `/action <ability>` | Use an Interface ability |
| `/programs` | List loaded programs |
| `/build <name>` | Build a NET architecture (Netrunner only) |

---

## Tech Maker (Crafting)

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+craft` | `+craft[/start\|check\|list\|cancel\|blueprint\|fieldrepair\|makerpoints]` | connected | Tech Maker crafting |

### Craft types

| Type | DV base | Materials cost | Description |
|------|---------|---------------|-------------|
| `fabricate` | by price category | 1/5 item cost | Build from scratch |
| `upgrade` | by price category | full item cost | Improve existing item |
| `invent` | by price category | varies | Create novel item |
| `field` | 13 | minimal | Quick field repair |

### Price categories and DVs

| Category | Item cost (eb) | Fabricate DV |
|----------|---------------|-------------|
| Cheap | 10 | 9 |
| Everyday | 50 | 13 |
| Costly | 500 | 15 |
| Premium | 1,000 | 17 |
| Expensive | 5,000 | 19 |
| Very Expensive | 10,000 | 21 |
| Luxury | 50,000 | 24 |
| Super Luxury | 100,000+ | 29 |

Maker Points = Role Rank × 2. Specialties: `fabrication`, `field`, `upgrade`, `invention`.

---

## Night Markets (Fixer Operator)

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+market` | `+market[/open\|close\|browse\|sell\|buy\|haggle\|list]` | connected | Night Market trading |

| Market tier | Requirement |
|-------------|------------|
| Night Market | Fixer Rank 5+ |
| Midnight Market | Fixer Rank 9+ |

### +market switches

| Switch | Action |
|--------|--------|
| `/open` | Open a Night or Midnight Market in current room |
| `/close` | Close your active market |
| `/browse` | List active listings in the room |
| `/sell <item>=<price>` | List an item for sale |
| `/buy <listing>` | Purchase a listed item |
| `/haggle <listing>` | Attempt to haggle down the price (Fixer only) |
| `/list` | List all your current active listings |

---

## Chop Shop

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+chopshop` | `+chopshop[/prices\|queue\|harvest\|install\|complete]` | connected | Cyberware chop shop |

Medtechs can harvest cyberware from willing (or unwilling) patients and install it in others. Harvesting carries a surgery roll; failure risks damaging the item.

---

## Bodysculpting

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+bodysculpt` | `+bodysculpt[/list\|view\|get\|remove] [mod]` | connected | Bodysculpting mods |

Bodysculpting applies cosmetic or minor physical modifications. Each mod has an associated HL cost and a Medtech DV requirement.

---

## Pharmaceuticals

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+pharma` | `+pharma[/list\|queue\|synth\|check]` | connected | Drug synthesis (Medtech) |

Medtech-only. Synthesize pharmaceutical drugs using the TECH + Pharmaceuticals skill. Synthesis takes real time; `+pharma/check` polls completion.

---

## Therapy

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+therapy` | `+therapy[/status\|session\|crisis] [target]` | connected | Cyberpsychosis therapy |

Reduces Humanity Loss through counselling sessions. Successful sessions restore EMP. The `cpr:cyberpsychosis:reduced` hook fires on each successful session.

---

## Gigs Board

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+gig` | `+gig[/list\|view\|post\|take\|complete\|abandon\|payout]` | connected | Night City gig board |

### +gig switches

| Switch | Action |
|--------|--------|
| `/list` | List open gigs |
| `/view <id>` | View gig details |
| `/post <title>=<desc>` | Post a new gig (stored in `cpr.jobs`) |
| `/take <id>` | Take the gig |
| `/complete <id>` | Mark a gig complete — collect your eddies |
| `/abandon <id>` | Walk away from a gig |
| `/payout <target> <amount>` | Admin: manually issue payout |

---

## Scavenging

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+scavenge` | `+scavenge [zone]` | connected | Scavenge current zone |

30-minute cooldown per character. Zone determines loot table and ambush probability.

| Zone | Risk | Loot quality |
|------|------|-------------|
| `downtown` | Low | Common goods |
| `badlands` | Medium | Salvage, vehicle parts |
| `combat_zone` | High | Weapons, cyberware scraps |
| `industrial` | Medium | Tech components |

---

## Admin

| Command | Syntax | Lock | Description |
|---------|--------|------|-------------|
| `+cpr` | `+cpr/<switch> <args>` | admin+ | Admin tools |

### +cpr switches

| Switch | Syntax | Effect |
|--------|--------|--------|
| `/stat` | `+cpr/stat <player>=<stat> <value>` | Set a stat directly |
| `/skill` | `+cpr/skill <player>=<skill> <value>` | Set a skill rank |
| `/role` | `+cpr/role <player>=<role>` | Change a player's role |
| `/rank` | `+cpr/rank <player>=<rank>` | Set role rank |
| `/eb` | `+cpr/eb <player>=<amount>` | Set EB balance absolutely |
| `/rep` | `+cpr/rep <player>=<amount>` | Set reputation score |
| `/hl` | `+cpr/hl <player>=<amount>` | Set Humanity Loss |
| `/heal` | `+cpr/heal <player>` | Fully restore HP |
| `/reset` | `+cpr/reset <player>` | Wipe CPR state (irreversible) |
| `/setmaker` | `+cpr/setmaker <player>=<spec> <rank>` | Set a Tech Maker specialty rank |
| `/info` | `+cpr/info <player>` | Dump full character JSON |
