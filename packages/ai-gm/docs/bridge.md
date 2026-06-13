# ai-gm — Plugin Bridge

ai-gm exposes two `gameHooks` events that peer plugins can use to integrate
without importing ai-gm as a dependency.

## gm:system:register

Emit this event to register a game system at runtime. The system is registered
immediately — no restart needed.

```typescript
import { gameHooks } from "@ursamu/ursamu";

await gameHooks.emit("gm:system:register" as never, {
  system: {
    id: "my-game",
    name: "My Game System",
    version: "1.0.0",
    source: "ingested",
    ingestedFrom: ["@my/plugin"],
    confidence: { coreRules: "high" },
    coreRulesPrompt: "...",
    moveThresholds: { fullSuccess: 4, partialSuccess: 1 },
    stats: ["Strength", "Agility"],
    adjudicationHint: "...",
    hardMoves: ["...", "..."],
    softMoves: ["...", "..."],
    missConsequenceHint: "...",
    categories: ["Attributes"],
    statsByCategory: { Attributes: ["Strength", "Agility"] },
  },
} as never);
```

The system shape must match `IStoredGameSystem` in `ai-gm/systems/store.ts`. The
`source` field must be `"ingested"`.

For cold-start persistence, also write the record to the
`server.gm.custom_systems` DBO collection — ai-gm's `loadCustomSystems()` reads
it on startup:

```typescript
import { DBO } from "@ursamu/ursamu";

const gmCustomSystems = new DBO("server.gm.custom_systems");
const existing = await gmCustomSystems.findOne({ id: "my-game" });
if (existing) {
  await gmCustomSystems.update({ id: "my-game" }, systemRecord);
} else {
  await gmCustomSystems.create(systemRecord);
}
```

## shadowrun:roll

Emit this event after a dice roll to inject the result into the current round
context. ai-gm appends it to the rolling player's contribution so the GM LLM
sees the mechanical outcome when it adjudicates.

```typescript
await gameHooks.emit("shadowrun:roll" as never, {
  playerId: "42",
  playerName: "Ghost",
  roomId: "10",
  pool: 8,
  hits: 3,
  glitch: false,
  critGlitch: false,
  edgeUsed: false,
  threshold: 4, // optional
  success: false, // optional
} as never);
```

**Behaviour:**

- If a round is open in that room: appends
  `[SR4 ROLL] Ghost: 8 dice → 3 hits vs threshold 4 — FAIL` to the player's
  poses. Does **not** mark the player as ready.
- If no round is open: stored as a `gmExchange` entry so it appears in the next
  round's `recentExchanges` context.
- If the room is not on the watch list: silently ignored.

## Shadowrun Integration

`@ursamu/shadowrun-plugin` uses both events automatically. On plugin init:

1. The SR4 game system is upserted into `server.gm.custom_systems`
2. `gm:system:register` is emitted so a running ai-gm instance picks it up
   immediately
3. Every `+roll` / `+roll/edge` command emits `shadowrun:roll` after the dice
   are resolved

No configuration needed — install both plugins and they find each other.

## Adding New Events

Any plugin can declare additional events by extending `GameHookMap` via
TypeScript declaration merging. See `game-hooks-augment.ts` in this repo for the
pattern.
