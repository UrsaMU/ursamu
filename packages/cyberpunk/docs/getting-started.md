# Getting Started — @ursamu/cyberpunk-plugin

## Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| Deno | ≥ 1.40 | Runtime |
| UrsaMU | ≥ 2.6 | `@ursamu/mush` / monorepo mush |
| Peers | help, combat ≥0.8, vendor ≥1.1, jobs ≥1.0 | |

## Install (monorepo)

Workspace member: `packages/cyberpunk`.

Point your game plugin list at the package path or JSR name
`@ursamu/cyberpunk-plugin`. Plugin id is **`cpr`**.

```jsonc
// plugins / config excerpt
{ "name": "cpr", "path": "./packages/cyberpunk" }
```

Ensure peers load first: `help`, `combat`, `vendor`, `jobs`.

## Verify

Connect as wizard:

```
+cpr/info me
```

No sheet yet is normal before chargen. Server log should show the
plugin init path without errors.

Players:

```
+chargen
+help cpr
+help chargen
```

## Docs map

| Need | Where |
|------|--------|
| Player first hour | `../FIRST-HOUR.md` |
| In-game topics | `../help/` via `+help` |
| Hooks / storage | `./dev/` |
| Full command list | `./commands.md` |

## Develop

```bash
cd packages/cyberpunk
deno task test
deno task check
```
