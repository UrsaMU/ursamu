# Dual-package / single mush instance

Published plugins often rewrite imports to a **range** of
`jsr:@ursamu/mush@^x.y.z`. Deno can load **two copies** of mush
(different resolved versions). Then `addCmd` registers on one copy
while the running engine dispatches on another - commands appear
missing ("Huh?").

## Supported host pattern (1.0)

Game `deno.json` **import map overrides** force every historical
range onto one concrete version:

```json
{
  "imports": {
    "@ursamu/mush": "jsr:@ursamu/mush@1.0.0",
    "ursamu": "jsr:@ursamu/mush@1.0.0",
    "@ursamu/ursamu": "jsr:@ursamu/mush@1.0.0",
    "jsr:@ursamu/mush@^0.1.1": "jsr:@ursamu/mush@1.0.0",
    "jsr:@ursamu/mush@^0.1.28": "jsr:@ursamu/mush@1.0.0",
    "jsr:@ursamu/mush@^0.2.0": "jsr:@ursamu/mush@1.0.0",
    "jsr:@ursamu/mush@^1.0.0": "jsr:@ursamu/mush@1.0.0",
    "@ursamu/core": "jsr:@ursamu/core@1.0.0",
    "jsr:@ursamu/core@^1.0.0": "jsr:@ursamu/core@1.0.0"
  }
}
```

`@restart` / `bumpUrsamuImports` + `applyEngineOverrides` write
these keys for common engine packages (mush, core, help).

## Host checklist

1. One concrete mush version in `imports` and matching `jsr:@…@^…`
   override keys for every range plugins may pull.
2. Same for core when plugins depend on it directly.
3. After bump: purge Deno lock entries for old mush/core, cache,
   then soft-reboot (or process restart if required).
4. Verify with `deno info src/main.ts` - only one `@ursamu/mush@`
   and one `@ursamu/core@` resolution.

## Rules for plugin authors

1. Depend on **`@ursamu/mush@^1.0.0`** (or later 1.x).
2. Do not bundle a second copy of mush.
3. Register commands via `addCmd` from the same package id the host
   uses (`@ursamu/mush` / `ursamu`).
4. Prefer `u.util.header` / `divider` / `footer` over importing
   layout helpers if dual load is possible (host layout templates
   live on the engine instance).

## Debugging

- `deno info src/main.ts` - look for more than one `@ursamu/mush@`
- In-game: command missing after plugin load - check overrides
- Logs: plugin version vs engine version mismatch
