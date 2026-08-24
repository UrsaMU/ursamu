# Changelog

## 1.0.0

- Port feature-complete CPR plugin into monorepo `packages/cyberpunk`.
- Package `@ursamu/cyberpunk-plugin`, plugin name `cpr`.
- `@ursamu/combat` EncounterStore (`cpr.encounters`) + CombatPorts.
- Vendor hooks for eurodollar spend/refund and gear spawn.
- Jobs buckets `CGEN` / `SHEET` + CGEN job:closed approve hook.
- REST `/api/v1/cpr/*` (meta, sheet, chargen, approve).
- Help tree, showcases, and core unit tests retained from source.
