# Changelog

All notable changes to `@ursamu/core` are documented here.
Format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [1.0.5] - 2026-09-04

Re-cut of NAWS/term-size APIs (1.0.3 was already on JSR).

## [1.0.3] - 2026-09-04

### Added

- `clampTermHeight`, `applySessionTermSize`, `resolveWrapWidth`
- `session:termSize` hook (NAWS / client size updates)
- WS packets with `data.termWidth` / `termHeight` update session

### Changed

- Telnet word-wrap uses session `termWidth` when set (else 78)
- NAWS stores width and height on session.meta

## [1.0.2] - 2026-08-05

### Fixed

- Skip 78-column `wordWrap` for `clientType === "web"` sessions.
  Web FEs size their own column; hard-wrap broke ASCII art and look
  lines in a wide center pane. Telnet still wraps at 78.

## [1.0.0] - 2026-07-28

First stable release of the generic multiplayer text-server layer.
No MUSH world model (that is `@ursamu/mush`).

### Added

- Stable API documentation in README (stable vs internal exports)
- `docs/DBO.md` - collection and adapter contract
- `docs/LIFECYCLE.md` - plugin and middleware teardown policy
- `removeMiddleware` / `clearMiddleware` / `getMiddleware`
- Public re-exports: `unloadPlugin`, `listPlugins`, `getPlugin`
- Tests: queue enqueue/cancel, plugin unload, middleware order,
  telnet IAC/NAWS helpers
- CHANGELOG and docs included in publish

### Changed

- Version **1.0.0** - breaking changes after this require a major bump
- Documented dependency pins (typegraph, pglite, djwt, zod)

### Security (inherited 0.1.x)

- HTTP/SSE/WS rate limiting and auth-related tests
- SSE socket id isolation
- Config prototype pollution guards on DBO where clauses

## [0.1.6] - 2026-07

### Added

- DB path helpers for TypeGraph / Deno KV
- Plugin dependency semver checks and topo sort
- Transports: WebSocket, Telnet, HTTP+SSE
- `DBO`, `gameHooks`, sessions/JWT, rooms, queue, config, logging

## [0.1.0] - 2026

Initial JSR line for the extracted core package.
