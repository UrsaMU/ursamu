# Combat adapter checklist (@ursamu/combat ≥ 0.8)

## Required

1. **Collection** — own DBO name (`cofd.encounters`, `cpr.encounters`, …)
2. **`EncounterStore`** — get/create/save/findInRoom/advanceTurn/patchParticipant
3. **`makeXPorts(u)`** — loadActor, executeAction → rich `CombatActionResult`
4. **`init`** — `registerEncounterStore` + `registerCombatBrain(jsonStrategyBrain)`
5. **Load order** — `@ursamu/combat` before your plugin
6. **Smoke** — `runAdapterSmoke({ store })` in package tests

## Recommended helpers

```ts
startOrJoin({ roomId, participant, store, ports, startedBy })
passTurn(encId, { actorId, store, ports })
endFight(encId, { store, ports })
formatInitiativeLines(enc)
```

## CombatActorView (AI)

Fill optional fields for better brains:

- `tags` — `"critical"`, `"in_cover"`, …
- `resources` — `{ ammo: 12, luck: 3 }`
- `side` — faction label

JSON conditions: `hasTags`, `missingTags`, `resourceAtLeast`,
`resourceAtMost`, `sideIs`.

## listActions (optional)

If `ports.listActions` returns a non-empty list, the walker constrains
brain output to legal actions (type + target + mode).
