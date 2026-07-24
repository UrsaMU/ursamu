# CofD + combat hybrid — release checklist

## Automated (CI / pre-tag)

```bash
cd packages/combat && deno task test
cd packages/cofd && deno test -A --unstable-kv --no-check \
  tests/combat/release_smoke.test.ts \
  tests/combat/initiative_port.test.ts \
  tests/combat/walker_*.ts \
  tests/combat/turn_auto_safety_test.ts \
  tests/combat/ai_modes.test.ts \
  tests/encounter.test.ts \
  tests/ai_strategy.test.ts
```

Expect: all green. Smoke file covers start → NPC turn → PC halt, resolve, manual.

## Config (Court of Miracles)

- [x] `server.plugins` lists `@ursamu/combat` **before** `@ursamu/cofd-plugin`
- [x] `deno.json` maps `@ursamu/combat` → monorepo path (dev) / JSR in package
- [x] Encounters stay on **`cofd.encounters`**
- [x] Types from `@ursamu/combat` via `cofd/src/combat/types.ts`
- [x] Plugin dep `combat >= 0.3.0`
- [x] `@ursamu/combat@0.3.0` published to JSR
- [x] Dead TS AI archetypes removed (JSON-only)
- [x] Initiative port (`0.4.0`)
- [x] Lifecycle helpers (`0.5.0`)
- [x] Zone pathfind + loop + store routing (`0.6.0`)
- [x] Automated: `tests/combat/initiative_port.test.ts`
- [x] Publish combat@0.6.0 when tagging COR

## Live smoke (operator)

1. Restart COR after pull.
2. Confirm boot log: `[combat] ready` and cofd loaded.
3. Fight with auto AI NPC → NPC acts → PC gets turn.
4. Win fight → resolve / beats.
5. `manual` AI NPC does not auto-act.

## Out of scope for this release

See [EXTRACTION.md](./EXTRACTION.md) for full extraction backlog.
