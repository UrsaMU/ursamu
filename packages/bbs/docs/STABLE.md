# Stable API contract (bbs 1.0)

**Published:** `1.0.0`  
Breaking changes to **stable** surfaces require a **major** bump.

## Stable surfaces

| Surface | Notes |
|---------|--------|
| default plugin | `init` / `remove` |
| `seedBoards` / `seedDefaultBoards` | Idempotent board seed |
| DBO names | `server.bboards`, `server.bboard_posts` (frozen) |
| REST prefix | `/api/v1/boards` — contract in `docs/REST.md` |
| Staff UI | **In-console** via `@ursamu/web` `/admin/bbs` (AppLayout). Package SPA `/admin/bbs-app/` only if web is absent. |
| Types | `IBoard`, `IPost`, `IReply`, `IFlag` |
| REST auth helpers | `src/rest-auth.ts` (exported from package) |
| Commands | See `docs/MYRDDIN.md` matrix |

## Peers

| Peer | Range |
|------|-------|
| `@ursamu/mush` | `^1.0.0` |
| `@ursamu/help` | `^1.0.0` |
| `@ursamu/jobs` | `^1.1.1` (optional soft-load) |

## Quality bar

- `deno check mod.ts --unstable-kv` green
- `deno lint` green
- `deno task test` green
- REST auth unit-tested (no substring staff flags)
- REST contract in `docs/REST.md`
- Operator README (install, data, security)
- UI built into `dist/` before publish

## Frozen behaviors (1.0)

- Sticky on create: **two-step** POST then PATCH
- Locks: `all()`, `faction`, plus `flag()` / `perm()` / `&&` `||` `!`
  (and legacy `admin+` ladders) on game + REST
- REST replies: `POST …/posts/:num/replies`
- Staff console is `@ursamu/web` **AppLayout** at `/admin/bbs`
  (same chrome as wiki/jobs). Package SPA is fallback-only.

## Explicit non-goals

- Softcode object / SHA1 installer parity
- Per-player color theme attrs
- `attr()` / `holds()` on REST without DB (fail-closed;
  use engine path in-game via `evaluateLock`)

## Version policy

| Change | Bump |
|--------|------|
| Remove command / REST route / DBO rename | major |
| New switch, additive REST field, SPA feature | minor |
| Bug fix, docs, help | patch |
