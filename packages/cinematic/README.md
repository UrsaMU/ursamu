# @ursamu/cinematic-plugin

Cinematic Unisystem for UrsaMU — point-buy chargen, D10 rolls,
Success Levels, combat maneuvers, and Drama Points. Extracted from
the *Cinematic Unisystem RPG* compilation (C.J. Carella et al., Eden
Studios), covering the BtVS/AFMBE rules family.

## Install

```json
// deno.json
{
  "imports": {
    "@ursamu/cinematic-plugin": "jsr:@ursamu/cinematic-plugin@1.0.0"
  }
}
```

```typescript
import plugin from "@ursamu/cinematic-plugin";
// register via your game's plugin loader
```

Dependency: `help >= 1.0.0`. Monorepo checkouts can import the
workspace path `packages/cinematic` instead of JSR.

## Commands

| Command | Lock | Purpose |
|---------|------|---------|
| `+chargen/start` | connected | Begin a draft character |
| `+chargen/type <slug>` | connected | whitehat / hero / experienced |
| `+stat <name>=<level>` | connected | Set an attribute (1-6) |
| `+skill <slug>=<level>` | connected | Set a skill (0-10) |
| `+quality <slug>[=<lvl>][:<qualifier>]` | connected | Add a quality (levels x cost; qualifier shows as `Name(org)`) |
| `+drawback <slug>[=<lvl>][:<qualifier>]` | connected | Add a drawback (max 10 pts) |
| `+chargen/submit` | connected | Submit for approval |
| `+chargen/approve <player>` | admin+ | Approve |
| `+chargen/reject <player>=<note>` | admin+ | Return for revision |
| `+sheet [<player>]` | connected | Show a sheet (staff: others) |
| `+background <field>=<value>` | connected | Set concept, form, effects, conditions, weaknesses |
| `+damage <n>` | connected | Apply/heal Life Point damage |
| `+xp <player>=<n>` | admin+ | Grant experience points |
| `+roll <attr> [<skill>] [<mod>]` | connected | D10 + attr + skill vs 9 |
| `+drama` / `+drama/heroic` / `+drama/okay` | connected | Drama Points |
| `+maneuvers` | connected | Combat maneuver reference |
| `+gear` / `+gear/armor` | connected | Weapons/armor catalog |
| `+gear/info <slug>` | connected | Weapon or armor details |
| `+gear/wield <slug>` | connected | Set equipped weapon |
| `+gear/wear <slug>` | connected | Set equipped armor |
| `+gear/give <player>=<slug>` | admin+ | Mint object with `&WEAPON`/`&ARMOR` attr |

## Data

Slug-keyed JSON tables under `data/`:

- `charactertypes.json` — White Hat / Hero / Experienced Hero budgets
- `skills.json` — the 18 skills with linked attributes
- `qualities.json` — 70 qualities/drawbacks with point costs
- `maneuvers.json` — 24 combat maneuvers (roll + base damage)
- `weapons.json` — 15 weapons (damage formula, type, skill, range, hands)
- `armor.json` — 6 armors (protection by Bash/Slash/stab/Bullet + coverage)

Damage resolution order (`src/damage.ts`): base damage + attack Success
Levels, minus Armor Value for the damage type, then the type multiplier
(Bash x1, Slash/stab x2, Bullet x2 vs normal humans). Special cases
(Bites, Through the Heart) override the type multiplier. Minted gear
objects carry stats as plain `&key=value` attributes
(`&dmg=4xStrength`, `&bash=8`, `&coverage=Torso`, ...).

## AI GM bridge

`src/game-system.ts` soft-registers `cinematic-unisystem` via
`gm:system:register` on `engine:ready` — core rules prompt, hard/soft
moves, and a plain-text character context formatter. No ai-gm import.

## REST

`GET /api/v1/cinematic/:playerId` — returns the player's sheet
(`401` without auth; admin can read any player).

## Development

```bash
deno task check     # deno check index.ts commands.ts
deno task test      # unit tests
deno task showcase            # list flows
  deno task showcase chargen  # run the chargen walkthrough
deno lint
```

Character state lives in `state.cinematic` on the player object;
see `src/types.ts` for `ICinChar`.
