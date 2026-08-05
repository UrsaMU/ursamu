## 1.2.10

- **Victorian Lost** (`books/vctl.txt`) → CtL 2e catalog:
  Inventor / Lurker blessings (Inventive Genius, Larcenous
  Fingers); contracts Envoy's Splendor, Smoke-Stepping, Riot,
  Sabotage; Tatterdemalion's Workshop Victorian note
- Conversion notes: `docs/vctl-2e-conversion.md`

## 1.2.9

- Chargen options: seemings/kiths/courts/regalia return
  blessing, description, favoredRegalia, etc. for web pickers
- Seeming ↔ kith: setting kith fills seeming; changing seeming
  clears a mismatched kith; second favored cannot match
  seeming's favored Regalia

## 1.2.8

- Chargen: Werewolf closed for player pick (mortal +
  changeling only). `CHARGEN_TEMPLATE_KEYS` / `chargenTemplates()`
  gate +cg list, web options, and stage-2 set. Sheet/NPC code
  unchanged.

## 1.2.7

- **+cg** on web clients: navigate to Character tab (`/chargen`)
  instead of running the terminal stepper in /play.

## 1.2.6

- **+sheet** on web /play: structured layout (attribute/skill dots,
  health & willpower boxes, merits/contracts lists, advantages).
  Telnet ASCII sheet unchanged.

## 1.2.4

- Chargen HTTP: read `data.cofd_cg` on raw dbojs rows (was only `state`, so Next said Start chargen first)

## 1.2.2

- REST chargen API for public /chargen FE
- GET `/api/v1/cofd/chargen/options` catalog

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
