# Chronicles of Darkness (CoFD) UrsaMU Plugin

**[@ursamu/cofd-plugin](https://jsr.io/@ursamu/cofd-plugin)** · **v1.2.1**

Chronicles of Darkness 2e for **UrsaMU**: guided character generation,
dynamic ASCII sheets, a CoFD-compliant d10 roller, Health track, Beat/XP
economy, Conditions and Aspirations, IC/OOC travel, `+time`, and a
Changeling: The Lost overlay. File-driven supernatural templates.

See `CHANGELOG.md` for release notes.

---

## Install

```ts
// deno.json — pin the plugin
{
  "imports": {
    "@ursamu/mush": "jsr:@ursamu/mush@^1.0.0",
    "@ursamu/cofd-plugin": "jsr:@ursamu/cofd-plugin@^1.2.1",
    "@ursamu/help": "jsr:@ursamu/help@^1.0.0",
    "@ursamu/jobs": "jsr:@ursamu/jobs@^1.0.0",
    "@ursamu/combat": "jsr:@ursamu/combat@^0.8.0"
  }
}
```

```ts
// Enable in config/config.json (or server.plugins):
// "server": { "plugins": [ "@ursamu/cofd-plugin", ... ] }

// Or import the default IPlugin (engine loaders use this):
import cofd from "@ursamu/cofd-plugin";
// cofd.name === "cofd"
// cofd.version === "1.2.1"
```

```bash
# JSR
deno add jsr:@ursamu/cofd-plugin
```

**Peers:** `@ursamu/mush` ^1.0, `@ursamu/help` ^1.0, `@ursamu/jobs` ^1.0,
`@ursamu/combat` ^0.8, optional `@ursamu/mail` ^2.5.

---

## Features

- **File-driven supernatural templates.** Add Mortal, Changeling: The Lost,
  or minor templates by dropping a JSON file in `templates/`.
- **Guided character generation (`+cg`).** Six stages with point-budget
  validation at every step.
- **Dynamic ASCII sheets (`+sheet`).** 78-column wide, template-aware,
  composed of independently-renderable sections.
- **CoFD-compliant d10 roller (`+roll`).** 10/9/8-again, rote actions,
  Willpower spend, untrained-skill penalties, specialty bonuses, chance
  dice with Dramatic Failure.
- **Health track (`+health`).** Bashing/lethal/aggravated cascade,
  automatic wound penalty subtracted from every `+roll` pool.
- **Beat / XP economy (`+beat`, `+xp`).** Five Beats roll over into one
  Experience; separate Arcane pool for supernatural-related events;
  cost table loaded from `resources/xp_costs.json`.
- **Conditions and Aspirations (`+condition`, `+aspiration`).** 36 core
  Conditions plus 21 Tilts catalogued in `resources/conditions.json`.
  Resolving a Condition or fulfilling an Aspiration awards Beats
  automatically.
- **Changeling: The Lost overlay (playable Lost v1+).** Identity (Seeming,
  Kith, Court, Needle, Thread), Wyrd / Glamour / Clarity, Mask/mien and
  Chrysalis (`+shift`), Contracts with loopholes and seeming clauses
  (`+contract`), Clash of Wills (`+clash`), Glamour harvest/reap
  (`+harvest`, `+reap`), Incite Bedlam (`+bedlam`), frailties and cold
  iron (`+frailty`), pledges (`+pledge`), kenning and dual look
  (`+kenning`, `fae` flag). Hedge travel, navigation, goblin fruit,
  Hollows (`+hedge` including `/route` and `/luxury`), Goblin Markets
  and Debt (`+market`, `+debt`), Icons (`+icon`), Hedgespinning subtle
  and paradigm (`+spin`), Tokens (`+gear/token`). CtL merits (Mantle,
  Court Goodwill, Hollow, Stable Trod, Acute Senses, Pandemoniacal).
  Oneiromancy (`+dream`); Fetches (`+fetch`); Wild Hunt
  (`+hunt`); Mantle dice + high-dot (`+mantle`); Hobgoblins
  (`+hob`); Hollow Hidden Entry / Shadow Garden. Status:
  `docs/ctl-gap-scan.md`.

---

## Commands

```
+cg                       View chargen stage and progress.
+cg/set <trait>=<value>   Distribute chargen points.
+cg/back, /reset, /submit Navigate stages.

+sheet [<player>]                       View a character sheet.
+sheet/set <trait>=<value>              Edit your own sheet.
+sheet/set <player>/<trait>=<value>     Builder+: edit another sheet.
+sheet/set specialty/<skill>=<name>     Add a skill specialty.

+roll <expression>                      Roll a CoFD dice pool.
+roll/wp/rote/9again/8again ...         Combine switches with / or ,.

+health [<player>]                      View the Health track.
+health/bash, /lethal, /agg [N]         Apply damage.
+health/heal, /heal-bash, /heal-lethal, /heal-agg [N]   Heal damage.

+beat add[/arcane] [<player>] [= <reason>]   Award 1 Beat.
+beat sub[/arcane] [<player>]                Subtract 1 Beat (correction).

+xp [<player>]                          View XP pools.
+xp/spend <trait>=<dots> [for <player>] Spend XP to raise a trait.
+xp/list                                Show the XP cost table.

+condition [<player>]                   View active conditions.
+condition/add <key>[/<note>] [for <player>]
+condition/remove <key> [for <player>]      Correction, no Beats.
+condition/resolve <key> [for <player>]     Awards catalog Beats.
+condition/list                             Print the catalog.

+aspiration [<player>]                  View active aspirations.
+aspiration/add[/long] <text> [for <player>]
+aspiration/remove <#> [for <player>]
+aspiration/fulfill <#> [for <player>]      Awards 1 Beat.

# Changeling: The Lost
+shift [<form>]                  Mask/mien or animal form.
+contract [/loophole] <name>     List/invoke Contracts.
+clash <target>                  Clash of Wills.
+harvest [target][=pool]         Harvest Glamour from emotion.
+reap <target>                   Reap (fill Glamour; Ravaged; BP).
+bedlam <emotion> [+G]           Incite Bedlam.
+frailty [/iron]                 Taboos, banes, cold iron.
+pledge[/seal|/oath|/bargain]    Seals, oaths, bargains.
+kenning [<target>]              Fae perception.
+hedge[/open|/travel|/hollow|…]  Hedgeways, Hollows, fruit, /route.
+market[/buy|/credit|…]          Goblin Markets (Glamour or debt).
+debt[/pay|/call]                Goblin Debts.
+icon[/grant|/spend|/recover]    Icons (lost pieces of self).
+spin <effect>                   Hedgespinning (subtle + paradigm).
+gear/token …                    Tokens (activate / catch).
+dream[/ivory|/horn|/weave|…]    Oneiromancy / Bastions.
+fetch[/echo|/create|…]          Fetches and Echoes.
+hunt[/track|/power|/mark|…]     Wild Hunt / Huntsman.
+mantle [/glamour|/debt|/clarity] Court Mantle bonuses.
+hob[/create|/power|…]           Hobgoblins.
```

Full per-command help: `help cofd`, then topic groups
`help character`, `help dice`, `help status`, `help combat`,
`help social`, `help reference`, `help templates`, or
`help changeling` for the CtL map — or any command name
(`help sheet`, `help hedge`, `help harvest`, `help bedlam`).

CtL design notes (maintainers): monorepo `docs/` (not published to JSR).

---

## Project layout

```
@ursamu/cofd-plugin/
  index.ts           IPlugin entry (init/remove + deps)
  commands.ts        Side-effect addCmd registration
  cofd.ts, cg.ts,    Back-compat re-export shims
    templates.ts
  routes.ts          REST /api/v1/cofd
  src/               Engine modules (stats, roller, sheet, …)
  resources/         JSON tables (attributes, merits, …)
  templates/         mortal / changeling / … JSON
  help/              In-game help topics
  deno.json          Package manifest + publish include
  ursamu.plugin.json Plugin manifest
```

---

## Setup and tests

```bash
deno task test          # full suite — must stay green
deno check index.ts     # plugin loads cleanly
deno task showcase      # interactive command demo
```

The plugin declares `help >= 1.0.0` as a dependency in
`ursamu.plugin.json` so the help directory is registered into the
help-plugin registry automatically.

---

## Inspiration

Layout and module split inspired by Thenomain's
[GMCCG](https://github.com/thenomain/GMCCG) for TinyMUX, ported to
UrsaMU's TypeScript / Deno plugin model.
