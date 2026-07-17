# CoFD JSON Resource Documentation

Chronicles of Darkness (CoFD) traits are fully data-driven. The system parses standard JSON resource files upon server initialization. If files are modified, modifications are automatically active upon the next server reboot.

## Location
All JSON resources reside in the `resources/` folder:
- `resources/attributes.json` — Categorized Attributes
- `resources/skills.json` — Categorized Skills
- `resources/merits.json` — Defined Merits, ratings, and prerequisites
- `resources/npcs/*.json` — NPC / antagonist templates (one file per slug)
- `resources/schemas/npc.schema.json` — JSON Schema for NPC autocomplete
- `resources/ai/*.json` — Combat AI strategies (rules + weights)
- `resources/schemas/ai-strategy.schema.json` — AI strategy autocomplete

---

## AI strategies (`resources/ai/`)

Declarative combat AI. Point `$schema` at the strategy schema for
autocomplete of conditions, actions, priorities, and weights.

```json
{
  "$schema": "../schemas/ai-strategy.schema.json",
  "slug": "beshilu-swarmer",
  "name": "Beshilu Swarmer",
  "rules": [
    {
      "id": "flee-wounded",
      "priority": 100,
      "weight": 1,
      "when": { "selfHealthBelow": 0.25 },
      "then": { "action": "flee" }
    },
    {
      "id": "weakest",
      "priority": 40,
      "weight": 1,
      "when": { "hasEnemies": true },
      "then": { "action": "attack", "target": "weakest" }
    }
  ],
  "fallback": { "action": "wait" }
}
```

### Evaluation order

1. Collect rules whose `when` **all** match (AND).
2. Keep the **highest `priority`** band only.
3. Within that band, pick **weighted random** (`weight`, default 1).
4. If nothing matches → `fallback` (default `wait`).

### Useful `when` fields

| Field | Meaning |
|-------|---------|
| `selfHealthBelow` | Remaining health fraction &lt; n (0–1) |
| `unrevealed` / `revealed` | `aiState.revealed` |
| `frenzied` / `damagedThisRound` | `aiState` flags |
| `hasThreat` / `noRecentDamage` | Threat table |
| `packMateDown` | Another NPC in the fight is out |
| `livingPackMatesAtLeast` | Other living NPCs |
| `enemyCountEquals` | e.g. `1` = isolated PC |
| `hasEnemies` / `hasCover` | Scene facts |

### `then` actions

`attack` (with `target`: `highest-threat` \| `weakest` \| `first` \|
`random` \| `isolated`), `move`, `reload`, `flee`, `posture` (+
`posture` type), `wait`.

NPC templates reference strategies via:

```json
"ai": { "archetype": "azlu-stalker" }
```

Shipped: `beshilu-swarmer`, `azlu-stalker`, `spirit-ridden-feral`.

Loader: `src/combat/ai/strategy_catalog.ts`.
Evaluator: `src/combat/ai/evaluate.ts`.

---

## NPC templates (`resources/npcs/`)

One JSON file per antagonist template. Point `$schema` at the schema for
editor autocomplete:

```json
{
  "$schema": "../schemas/npc.schema.json",
  "slug": "thug",
  "name": "Thug",
  "tier": "minor",
  "lineage": "mortal",
  "attributes": { "...": "1-5 each" },
  "skills": { "brawl": 3 },
  "integrity": 5,
  "size": 5
}
```

### Required fields

| Field | Notes |
|-------|--------|
| `slug` | kebab-case key for `+npc/build` / zone rules |
| `name` | Default display name |
| `tier` | `minor` \| `major` \| `storyteller` |
| `lineage` | `mortal`, `werewolf`, `changeling`, `spirit`, … |
| `attributes` | All nine Attributes, 1–5 |
| `skills` | Sparse map; omitted skills default to 0 |
| `integrity` | Integrity / Harmony / Clarity seed (0–10) |
| `size` | Body Size (humanoid 5) |

### Optional blocks by lineage

| lineage | Required block |
|---------|----------------|
| `werewolf` | `werewolf` (form, renown, essence, gifts…) |
| `changeling`, `hobgoblin`, `huntsman`, `fetch`, `true-fae` | `changeling` (Mask/Mien, contracts…) |
| `spirit`, `ghost` | `spirit` (rank, ban, bane…) |
| `host` | `host` (azlu / beshilu / other) |

### Spawn / behavior

- `ai` — string key or `{ archetype, startRevealed, preferMelee, … }`
- `defaults.aggro` — `passive` \| `territorial` \| `hunter`
- `defaults.presence` — `visible` \| `hidden` \| `ambush`
- `defaults.lookMode` — `mask` \| `mien` \| `auto` (CtL)
- `shortDesc` / `description` — room flavor and full look
- **Flavor arrays** — `shortDesc`, `description`, `changeling.mask`,
  and `changeling.mien` may be a **string** or a **non-empty string
  array**. At spawn, `pickFlavor` / `resolveSpawnFlavor` pick one
  entry at random so repeated mobs do not all share the same line.

```json
"shortDesc": [
  "A thick-necked bruiser in a stained hoodie.",
  "A wiry fighter with taped knuckles."
]
```

Shipped examples: `thug.json` (mortal), `autumn-courtier.json`
(changeling), `pure-raider.json` (werewolf Pure ambush).

Loader: `src/npc/catalog.ts` (`getNpcTemplate`, `listNpcTemplates`).
Helpers: `src/npc/types.ts` (`pickFlavor`, `resolveSpawnFlavor`).
Sheet + spawn: `src/npc/sheet_from_template.ts`
(`sheetFromTemplate`, `objectStateFromSheet`).

### Spawn wiring

| Path | Behavior |
|------|----------|
| `+npc/build Name=slug[/tier]` | Catalog template → sheet + flavor + flags |
| Zone `spawnOneMob` / respawn | Same; zone aggro overrides template default |
| Combat auto-spawn by archetype key | Catalog first, then legacy fallback |
| Theme tables | Entries must exist as JSON slugs |

`presence: hidden|ambush` adds the `dark` flag. Random flavor arrays are
resolved once per spawn and written to `short-desc` / `description`.

---

## 1. Attributes Schema (`resources/attributes.json`)
Defines the `mental`, `physical`, and `social` attributes. Each category is an array of lowercase strings.

### Schema:
```json
{
  "mental": [ "intelligence", "wits", "resolve" ],
  "physical": [ "strength", "dexterity", "stamina" ],
  "social": [ "presence", "manipulation", "composure" ]
}
```

---

## 2. Skills Schema (`resources/skills.json`)
Defines the `mental`, `physical`, and `social` skills. Each category is an array of lowercase strings.

### Schema:
```json
{
  "mental": [ "academics", "computer", "crafts", "investigation", "medicine", "occult", "politics", "science" ],
  "physical": [ "athletics", "brawl", "drive", "firearms", "larceny", "stealth", "survival", "weaponry" ],
  "social": [ "animal ken", "empathy", "expression", "intimidation", "persuasion", "socialize", "streetwise", "subterfuge" ]
}
```

---

## 3. Merits Schema (`resources/merits.json`)
Defines the list of valid merits. It is an array of Merit objects.

### Object Definition:
*   `key` (string): The lowercase, standardized identifier of the merit.
*   `name` (string): The human-readable name of the merit (displays on sheets).
*   `category` (string): One of `"Mental"`, `"Physical"`, `"Social"`, or `"Supernatural"`.
*   `allowedDots` (array of numbers): An array of specific dot ratings allowed for this merit. E.g., `[4]` means the merit can only be taken at exactly 4 dots. `[1, 2, 3]` means it can be taken at 1, 2, or 3 dots.
*   `prereqs` (array of strings): An array of prerequisite expressions evaluated against the character's sheet. See `docs/prerequisites.md` for syntax specifications.

### Example:
```json
[
  {
    "key": "giant",
    "name": "Giant",
    "category": "Physical",
    "allowedDots": [4],
    "prereqs": []
  },
  {
    "key": "iron stomach",
    "name": "Iron Stomach",
    "category": "Physical",
    "allowedDots": [2],
    "prereqs": ["stamina>=3"]
  }
]
```
