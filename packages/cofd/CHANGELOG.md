# Changelog

## [1.2.1] - 2026-07-28

### Docs / package quality

- Module and symbol JSDoc on the public entrypoint for JSR score
- README install examples; `license` field; description tightened
- Explicitly exclude local `books/` from package exclude/publish
  (rulebook extracts are never shipped)

## [1.2.0] - 2026-07-28

### Added

- `+time` — in-game date, clock, season, weather, moon, sun
  (London-like climate model)
- `+ic` / `+ooc` travel with IC location bookmark and room
  `ic` flag support
- Staff kit helpers and multi-view look overlays
- CtL help topic split and dorm config helpers

### Changed

- Peers raised to mush/core/help `^1.0.0`, jobs `^1.0.0`,
  mail `^2.5.0` (Court 1.x floor)
- Plugin deps: jobs `>=1.0.0`, mail `>=2.5.0`

## [1.1.14] - prior

Sheet, chargen, d10 roller, Health, Beats/XP, Conditions,
CtL overlay, combat hooks. See package history on JSR.
