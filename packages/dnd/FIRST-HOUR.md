# D&D plugin — first hour

End-to-end loop for a local house game.

## 1. Local game (monorepo)

A ready house game lives at **`games/dnd`** (local package
links for D&D, help, jobs, combat, vendor, bbs, mail,
channels, builder, wiki, map, web, site).

```bash
cd /path/to/ursamu/games/dnd
deno task start
```

| Service | URL / port |
|---------|------------|
| Site / play | http://localhost:4203/ |
| WebSocket | ws://localhost:4202/ |
| Telnet | `telnet localhost 4201` |

Register in the browser or telnet — first account is
**superuser**.

To re-scaffold from scratch (destructive):

```bash
rm -rf games/dnd
# from monorepo root, run the scaffold snippet in games/dnd/README.md
```

## 2. First character

**Web (recommended):** http://localhost:4203/chargen  
Log in → Character tab → guided D&D stepper → Submit.

**Telnet / play client:**

```
+cg
+cg/set class=Fighter
… walk the wizard …
+cg/submit
```

Staff (you):

```
+approve <Name>
```

## 3. Town

Havenbrook seeds on boot (`+dnd/world`).

```
+sheet
+money
look
east                 # Market → Forge
+list
+buy Longsword
+wield Longsword
```

## 4. Party (optional)

```
+hire guard
+party/invite Alice   # same room; they +party/accept
+adv/delve goblin-warren
# T2/T3: ogre-den · haunted-keep · troll-bridge
```

Foe counts scale with PCs + hirelings. Combat **auto-starts**
if the entry room has hostiles.

## 5. Fight & loot

```
+combat/status       # if already in a fight
+attack Goblin Scout
+pass                # hirelings/NPCs act
+kill <downed foe>
+loot                # all corpses + gold here
open <chest>         # boss end loot (may be magic)
use <altar>          # one-shot heal if present
+attune cloak_of_protection
+adv/leave
```

Sell extras (magic uses `valueGp`):

```
+sell Longsword      # at a vendor room
+magic               # catalog
```

## 6. Bounties & reputation

```
+bounty
+bounty/take goblin-raid
# kill matching foes / clear listed delve
+bounty/turnin       # XP + gp + faction rep
+rep                 # shop discounts at +5/+10/+25
```

## 7. Travel, roads, caravans & camps

```
out                  # path / ruins / gate
+travel              # wilderness check (party-scaled)
+road                # corridors to Millhaven / Ashford
+road/go ashford
+caravan/take flour-run
+caravan/leg         # may ambush; repeat until done
+caravan/deliver
+event               # local boon / rumor / fight
+camp/found Riverguard
+camp/upgrade
+rest/long
```

Staff multi-town:

```
+dnd/world
+dnd/world/goto millhaven|ashford
+dnd/world/seed
```

## 8. Rest & level

```
+rest/long
+xp
+level/status
+level
+level/asi str 2     # at 4/8/12/16/19
+level/feat Alert
+level/spell cure_wounds   # casters
```

## 9. Staff

```
+staffkit
+staffkit/xp Alice=300
+staffkit/encounter goblin
+staffkit/delve
+staffkit/towns
+staffkit/skins
```

## 10. Help map

```
+help dnd
+help adventure · hire · party · travel · road
+help bounty · caravan · event · rep · world
```

## Troubleshooting

| Symptom | Fix |
|---------|-----|
| No Havenbrook | Staff `+dnd/world/seed` |
| Delve no fight | `+combat/start` in the room |
| Hireling idle | Must be in fight; AI attacks foes |
| Can't level | `+level/status` — need XP; clear ASI |
| `+inv` wrong | Use `+inventory` (core `+i` steals it) |
| Travel quiet | Chance-based; try path/ruins again |
| Attune fail | Max 3; item needs attunement flag |
