# First hour — Cyberpunk RED on UrsaMU

## Local monorepo game

```bash
cd games/cpr && deno task start
```

Ports: telnet **4301**, ws/http **4302**, api **4303**.


## 1. Connect and chargen

```
+chargen
+chargen/method streetrat
```

Follow prompts (`+chargen/next`, role, stats, skills, chrome, gear).
When ready:

```
+chargen/done
+sheet
```

## 2. Check your eddies and lifestyle

```
+eb
+lifestyle
```

## 3. Gear and chrome

```
+gear
+cyber
+market
```

Buy from a Night Market stall or a `@ursamu/vendor` shop (EB).

## 4. Roll and fight

```
+roll handgun
+npc/build Razor=boosterganger   # staff
+init                            # NPCs auto-join
+attack Razor
+pass                            # NPCs act via AI walker
+combat/end
```

Brawl: `+brawl`. Autofire: `+fnff`. Heal: `+heal` / `+rest`.
NPC AI uses `@ursamu/combat` JSON brains (`aggressive` default).

## 5. Work the street

```
+gig/list
+gig/take <id>
+rep
+improve
```

## 6. Staff

```
+cpr/info <player>
+cpr/heal <player>
+job/list CGEN
```

`+gig` is the **IC mission board**. Staff request tickets use
`@ursamu/jobs` (`CGEN`, `SHEET`, …).
