# mekton-zeta

Mekton Zeta chargen, gear, personal combat, and AI GM bridge for UrsaMU.
Uses the Interlock System (STAT + SKILL + 1D10 vs. Difficulty Number).

## Commands

### Character Generation

| Command | Lock | Description |
|---------|------|-------------|
| `+chargen` | connected | View chargen status and checklist |
| `+chargen/start` | connected | Begin chargen (create a draft character) |
| `+chargen/next` | connected | Guided instructions for your next creation step |
| `+chargen/method <random\|concept\|cinematic>` | connected | Set stat generation method |
| `+chargen/stat <stat>=<value>` | connected | Set a primary stat |
| `+chargen/roll` | connected | Roll all stats randomly |
| `+chargen/skill <name>=<level>` | connected | Set a skill level |
| `+chargen/skills [<filter>]` | connected | Show skill points and current selections |
| `+chargen/lifepath` | connected | Display current lifepath |
| `+chargen/roll-lifepath` | connected | Auto-roll all basic lifepath charts |
| `+chargen/lifepath/set <field>=<value>` | connected | Manually set an appearance field |
| `+chargen/type <rookie\|professional>` | connected | Set character type |
| `+chargen/list <templates\|careers>` | connected | List templates or careers/professions |
| `+chargen/template <name>` | connected | Apply a rookie template |
| `+chargen/career <profession>` | connected | Add a career term |
| `+chargen/career/skills <term>=<s1>,...` | connected | Choose 5 skills for a career term |
| `+chargen/career/remove` | connected | Remove the last career term |
| `+chargen/submit` | connected | Submit character for staff review |
| `+chargen/pending` | admin+ | List submitted characters |
| `+chargen/view <player>` | admin+ | View another player's chargen record |
| `+chargen/approve <player>` | admin+ | Approve and lock a character |
| `+chargen/reject <player>=<note>` | admin+ | Return for revision with note |

### Sheet & Combat

| Command | Lock | Description |
|---------|------|-------------|
| `+sheet [<player>]` | connected | Display character sheet |
| `+roll <stat>+<skill>[/<difficulty>]` | connected | Roll an Interlock check |
| `+attack <target>=<weapon>` | connected | Full attack resolution |
| `+attack/manual <target>=<hits>/<loc>` | admin+ | Apply hits directly |
| `+damage <location>=<hits>` | connected | Apply damage to yourself |
| `+damage <player>/<location>=<hits>` | admin+ | Apply damage to another player |
| `+heal <location>` | connected | Roll First Aid on own location |
| `+heal <player>=<location>` | connected | Roll First Aid on another player |
| `+stun` | connected | Check or clear stun status |
| `+luck` | connected | Show remaining Luck points |
| `+luck/spend <amount>` | connected | Spend Luck points |

### Gear

| Command | Lock | Description |
|---------|------|-------------|
| `+gear` | connected | List equipment and total weight |
| `+gear/catalog [<category>]` | connected | Browse gear catalog |
| `+gear/buy <name>` | connected | Purchase from catalog |
| `+gear/add <name>=<weight>,<cost>` | connected | Add custom item |
| `+gear/remove <name>` | connected | Remove item from inventory |
| `+encumbrance` | connected | Show load vs EV and effective MA |

## Events

| Event | Direction | Payload |
|-------|-----------|---------|
| `player:login` | listen | Reminds players of pending chargen; refreshes Luck |
| `gm:system:register` | emit (init) | Registers `mektonSystem` with the AI GM bridge |
| `mekton:roll` | emit | `IMektonRollEvent` — every `+roll` result |
| `mekton:combat` | emit | `ICombatEvent` — every `+attack` resolution |

## Storage

| Collection | Purpose |
|------------|---------|
| `mekton.chars` | Character records (`IMektonChar`) |
| `mekton.reviews` | Audit log of approvals and rejections |

## REST Routes

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `GET` | `/api/v1/mekton-zeta` | required | List all characters (admin use) |
| `GET` | `/api/v1/mekton-zeta/:playerId` | required (own) | Get character + derived stats |

> REST routes registered in `init()` persist until server restart and cannot be hot-unloaded.

## AI GM Bridge

On `init()`, emits `gm:system:register` with `mektonSystem` (Interlock System) and registers
two dynamic event subscriptions: `mekton:roll` (cue: "Mekton roll") and `mekton:combat`
(cue: "Mekton combat"). No ai-gm source changes required.

## Running Tests

```bash
deno task test
# or directly:
deno test mekton-zeta/tests/ --allow-net --allow-read --allow-env --allow-write --unstable-kv
```

## Notes

- Commands registered via `addCmd()` are not unregistered on plugin removal.
- REST routes persist until server restart.
- `IGameSystem` is defined locally in `types.ts` (not yet in `jsr:@ursamu/ursamu` v2.x).
- Psionics (P12) and Mecha construction (P13) are deferred to future phases.
