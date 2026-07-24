# @ursamu/combat

System-agnostic combat engine for UrsaMU.

- **Encounters** — room-anchored initiative (`combat.encounters` by default)
- **Turn walker** — auto-resolves NPC turns until a PC acts
- **JSON AI brains** — declarative strategies under `resources/ai/`
- **Ports** — game systems supply attack/health/loot
- **Multi-brain** — ordered brains + optional `combat:decide` hook (ai-gm)
- **Zone helpers** — pathfind, timer loops, active-encounter room queries
  (spawn tables and mob sheets stay in the game system)

## Install

```ts
// plugins list (order: combat before game systems)
"@ursamu/combat",
"@ursamu/cofd-plugin",
```

```json
"@ursamu/combat": "jsr:@ursamu/combat@^0.2.0"
```

## Config (`config.json`)

```json
{
  "plugins": {
    "combat": {
      "brains": ["json"],
      "defaultAiKey": "beshilu-swarmer",
      "enableDecideHook": true
    }
  }
}
```

| Key | Meaning |
|-----|---------|
| `brains` | Brain ids in try-order (default registration order / `["json"]`) |
| `defaultAiKey` | Fallback when NPC has no `aiKey` |
| `enableDecideHook` | Emit `combat:decide` before brains (default true) |

Prefer LLM when available:

```json
"brains": ["json"]
```

and set NPC `aiKey` to `llm` — JSON skips it; a hook listener (ai-gm)
can claim the turn. Or register an `ai-gm` brain and list it first:

```json
"brains": ["ai-gm", "json"]
```

## Game system integration

```ts
import {
  registerCombatPorts,
  registerEncounterStore,
  type CombatPorts,
} from "@ursamu/combat";

// init():
registerEncounterStore(myStore); // optional; default combat.encounters
registerCombatPorts({
  async loadActor(id) { /* → CombatActorView */ },
  async executeAction(id, action, ctx) {
    // Return CombatActionResult — walker applies threat/log/out
    return {
      ok: true,
      damageApplied: 4,
      targetId: action.type === "attack" ? action.targetId : undefined,
      logLine: "Goblin hits Hero",
      endedTurn: true,
    };
  },
  broadcast(roomId, msg) { /* ... */ },
  async onResolved(enc) { /* loot / beats */ },
  async afterAction(id, enc) { /* sync isOut */ },
});
```

### CombatAction (0.7+)

System-agnostic actions. Hosts use `mode` / `args` for rule variants:

```ts
{ type: "attack", targetId, mode: "aimed", weaponId: "rifle" }
{ type: "use", abilityId: "sandevistan", endsTurn: false }
{ type: "defend" } | { type: "aim" } | { type: "hold" }
{ type: "custom", name: "suppress", args: { ... } }
```

### Encounter extras (Phase A)

```ts
enc.startedBy = playerId;
enc.log = ["…"];           // walker appends logLine
enc.meta = { system: "cpr" };
participant.side = "corp";
participant.meta = { … };
```

Per-command ports (CofD pattern) are fine when `u` is request-scoped:

```ts
await advanceTurnSmart(encId, {
  ports: makeCofdPorts(u),
  store: cofdEncounterStore,
});
```

## Lifecycle

```ts
const store = myEncounterStore; // or default combat.encounters

await startEncounter(roomId, { store, startedBy: playerId });
await joinEncounter(encId, { actorId, name, kind: "pc" }, { store });
await beginEncounter(encId, { ports, store }); // roll init + activate
await nextTurn(encId, { store });              // no AI
await leaveEncounter(encId, actorId, { store });
await endEncounter(encId, { store });
```

## Turn helpers (0.8+)

```ts
import {
  startOrJoin,
  passTurn,
  endFight,
  formatInitiativeLines,
  runAdapterSmoke,
  memoryEncounterStore,
} from "@ursamu/combat";

// +init style
await startOrJoin({
  roomId,
  participant: { actorId, name, kind: "pc" },
  store,
  ports,
  startedBy: actorId,
  autoBegin: false, // true = roll init immediately
});

// +pass style (marks acted, nextTurn, walker)
await passTurn(encId, { actorId, store, ports });

// +combat/end
await endFight(encId, { store, ports });

// Adapter CI smoke (5 checks)
const r = await runAdapterSmoke({ store: memoryEncounterStore() });
// r.ok === true
```

## Zone helpers (optional)

```ts
import {
  nextHopToward,
  startZoneLoop,
  stopZoneLoop,
  roomHasActiveEncounter,
  findActiveEncounterRoom,
} from "@ursamu/combat";

// Pathfind: host supplies exits
const hop = await nextHopToward(from, goal, allowedRooms, {
  getAdjacent: (id) => exitsFromRoom(id),
  costOf: async (id) =>
    (await roomHasActiveEncounter(id, { store })) ? 1000 : 1,
});

// Timers: host tick body (spawn / move / flavor)
startZoneLoop(zoneId, 30_000, () => tickMyZone(zoneId));
stopZoneLoop(zoneId);
```

**Collections:** each game keeps its own encounter DBO
(`cofd.encounters`, etc.) via `registerEncounterStore`. Do not rename
collections without a migrator.

## Initiative

Host supplies the formula; engine sorts and activates:

```ts
ports.rollInitiative = async (actorId) => {
  // e.g. CofD: 1d10 + Dex + Composure + weapon
  return n;
};

await beginEncounter(encId, { ports, store });
// = activateEncounter: roll all → sort → active
```

## JSON AI

```ts
import { getArchetype } from "@ursamu/combat";
const fn = getArchetype("beshilu-swarmer");
```

| aiKey | Behavior |
|-------|----------|
| `beshilu-swarmer` etc. | JSON strategy |
| `manual` / `off` / `none` | Walker halts (ST) |
| `llm` / `ai-gm` | JSON skips; hook/brain may handle |

## Optional ai-gm (ships wired)

`@ursamu/ai-gm` ≥ 0.2.4 registers:

1. `gameHooks.on("combat:decide", …)` for `aiKey` `llm` / `ai-gm`
2. Brain id `ai-gm` (prefer with `"brains": ["ai-gm", "json"]`)

Without `GOOGLE_API_KEY`, the listener still decides via
weakest-enemy attack fallback so the walker does not hang.

```ts
// NPC sheet
state.npc.aiArchetype = "llm"; // CofD
// or state.dnd.aiKey = "llm";  // D&D
```

## Decide pipeline

```
manual? → halt
combat:decide hook (if enabled)
brains in config order (then any unlisted registered brains)
none → halt (ST)
```

## Architecture

```
@ursamu/combat
    ↑ ports/store          ↑ combat:decide / brains
cofd-plugin    dnd-plugin    ai-gm (optional)
```

## Second-system proof (Phase 4)

`@ursamu/dnd-plugin` implements the same ports:

| Piece | CofD | D&D |
|-------|------|-----|
| Store | `cofd.encounters` | `dnd.encounters` |
| Default AI | `beshilu-swarmer` | `aggressive` |
| Attack | CoFD dice + weapons | d20+mod vs AC, 1d8 dmg |
| Walker | `cofd/.../walker.ts` | `dnd/.../walker.ts` |

Both call:

```ts
advanceTurnSmart(id, { ports: makeXPorts(u), store: xStore });
```

Generic strategy `aggressive` ships in `resources/ai/` for any system.

## License

MIT
