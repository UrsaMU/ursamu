# UrsaMU D&D 5e/2024 System Plugin

This package implements character generation, sheets, rolling, weapons, inventory, shop vendors, and turn-based combat with automated NPC AI for UrsaMU.

It is built to match the rules and parameters defined in the **[D&D System Reference Document (SRD)](https://www.dndbeyond.com/srd)**.

## Features

### 1. Guided Character Generation (`+cg`)
Walks players through a multi-stage wizard to build their characters:
- **Class selection** (12 classes with saves, hit die, skill options, and spellcasting).
- **Origin selection** (Species and backgrounds with stats increases and feats).
- **Ability Scores** using the standard 27-point buy system.
- **Skill Proficiencies** and class-specific starter **Origin Feats** and **Spells**.
- **Starting Gold & Equipment**: Spawns default class gear (e.g. longswords, scale mail, shields, daggers) automatically in the player's inventory and sets class starting gold upon sheet submission.

### 2. Character Sheets & Trait Editing (`+sheet`)
Displays character sheets formatted in a clean, vertical ASCII layout, tracking AC, stats, saves, skills, feats, and spells. Builders can customize traits with `+sheet/set <trait>=<value>`.

### 3. Weapons, Armor, Shields, & Inventory (`+inventory`)
- Dynamic AC calculations taking into account equipped light, medium (capped at +2 Dex), or heavy (ignores Dex) armor, plus shield bonuses (+2 AC).
- Security locks wrapping core `drop` and `give` commands to prevent players from transferring equipped/wielded items.

### 4. Shop Vendors & Economy (`+vendor/create`, `+list`, `+buy`, `+sell`)
- Spawns shop vendor NPCs in rooms with specific item inventories and prices.
- Lists available merchant stocks and prices in a vertical catalog format.
- Lets players buy items (which updates their sheets and spawns the inventory object) and sell carried items for gold (gp).

### 5. Automated Turn-Based Combat (`+combat/start`, `+attack`)
- Room-scoped turn queues rolling initiative (`1d20 + Dex Modifier`) for all characters.
- Rudimentary videogame/MUD-style NPC AI: when it is an NPC's turn, they automatically target a random conscious player, execute thematic attacks (e.g. Goblins with Scimitars, Orcs with Greataxes), apply damage, print the rolls, and pass the turn.
