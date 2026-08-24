# Changelog

## 0.2.0

### Added

- Pure helper module (`helpers.ts`) for capacity, filters, RSVP/status parsing,
  create/edit argument parsing, and event/RSVP factories.
- Shared `service.ts` mutation layer used by commands and REST.
- In-game commands emit the same `eventHooks` as REST (`created`, `updated`,
  `cancelled`, `completed`, `deleted`, `rsvp`, `rsvp-cancelled`).
- `registerHelpDir` + `help/event.md`, `help/events.md`.
- Version constants (`EVENTS_VERSION`, `EVENTS_PLUGIN_ID`, …).
- Package dependency on `@ursamu/help` for help registration.
- Staff console nav + `events:upcoming` badge bridges (`@ursamu/web`).
- Host admin UI route `/admin/events` (`EventsView.vue`).
- Scene hint bridge (`onEventSceneHint`) for cancel/complete/active status.
- Discord soft bridge (`@ursamu/discord` event webhooks via `events` channel).
- Unit + integration tests: helpers, hooks, service, REST router, command path,
  staff/scene bridges.
- Live E2E: `games/events-local` mock game + Playwright admin UI + REST suite
  (`deno task e2e`).
- `flagSetFromRaw` so REST staff checks accept DBO string/array flags.
- Admin WS RPC allowlist includes `/api/v1/events`.
- README and this CHANGELOG.

### Changed

- Plugin version **0.1.0 → 0.2.0**.
- Router and commands share service + helper logic for staff checks, capacity,
  and RSVP status aliases (`yes`/`no`/`decline`).
- `+events` reuses the shared list path (no duplicated query logic).

## 0.1.0

- Initial calendar commands, REST API, DBO collections, and hook bus (REST only).
