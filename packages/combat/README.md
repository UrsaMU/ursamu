# @ursamu/combat

System-agnostic combat engine for UrsaMU.

- **Encounters** — room-anchored initiative (`combat.encounters` by default)
- **Turn walker** — auto-resolves NPC turns until a PC acts
- **JSON AI brains** — declarative strategies under `resources/ai/`
- **Ports** — game systems supply attack/health/loot
- **Multi-brain** — ordered brains + optional `combat:decide` hook (ai-gm)

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
  async executeAction(id, action, ctx) { /* attack etc */ },
  broadcast(roomId, msg) { /* ... */ },
  async onResolved(enc) { /* loot / beats */ },
  async afterAction(id, enc) { /* sync isOut */ },
});
```

Per-command ports (CofD pattern) are fine when `u` is request-scoped:

```ts
await advanceTurnSmart(encId, {
  ports: makeCofdPorts(u),
  store: cofdEncounterStore,
});
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

## Optional ai-gm (no hard dependency)

```ts
// in ai-gm or a bridge plugin
import { gameHooks } from "@ursamu/mush";
import type { CombatDecideHookCtx } from "@ursamu/combat";

gameHooks.on("combat:decide", async (ctx: CombatDecideHookCtx) => {
  if (ctx.selfView.aiKey !== "llm") return;
  // ask GM model...
  ctx.handled = true;
  ctx.action = { type: "attack", targetId: "..." };
});
```

Or register a brain:

```ts
registerCombatBrain({
  id: "ai-gm",
  async decide(ctx) {
    if (ctx.selfView.aiKey !== "llm") return null;
    return { type: "wait" }; // or real action
  },
});
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
