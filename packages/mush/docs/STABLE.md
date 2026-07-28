# Stable API contract (mush 1.0)

Breaking changes to **stable** exports require a **major** version
bump. **Internal** exports may change in minor releases; prefer
stable wrappers.

## Stable (semver-covered)

**Commands**
  `addCmd`, `clearCmds`, `cmds`, `loadDefaultCommands`,
  `registerScript`, `getScript`, `ICmd`, `IUrsamuSDK`

**Cmd middleware**
  `registerCmdMiddleware`, `unregisterCmdMiddleware`,
  `clearCmdMiddleware`, `listCmdMiddleware`,
  `runWithCmdMiddleware`

**World DB**
  `dbojs`, `counters`, `Obj`, `createObj`, `hydrate`,
  `IDBObj`, `IAttribute`

**Flags / locks**
  `flags`, `flagCodes`, `evaluateLock`, `validateLock`,
  `registerLockFunc`, `callLockFunc`, `LockFunc`

**Permissions**
  `canEditObject`, `canSeeAttr`, `canSetAttr`, `canEditAttr`,
  `privRank`, `isPrivileged`, `isWizardPlus`

**Softcode**
  `runSoftcode`, `runSoftcodeSimple`, `softcodeEngine`,
  stdlib `register` / `lookup` / `entries`,
  `registerSub` / `lookupSub`

**Sandbox**
  `sandboxService`, `SandboxService`

**Format**
  `registerFormatHandler`, `unregisterFormatHandler`,
  `registerFormatTemplate`, `resolveFormat`,
  `resolveFormatOr`, `resolveGlobalFormat`,
  `resolveGlobalFormatOr`, `FormatSlot`

**Layout**
  `header`, `divider`, `footer`,
  `registerHeader` / `registerDivider` / `registerFooter`
  (+ unregister variants),
  `setLayoutTemplates`, `getLayoutTemplates`,
  `clearLayoutTemplates`, `applyLayoutFromConfig`,
  `hasLayoutTemplate`

**Events**
  `gameHooks` (core + mush map), mush event payload types,
  `chargenHooks`

**Engine**
  `initializeEngine`, `mu`, `createNativeSDK`

**Routes**
  `registerPluginRoute`, `registerMushRoutes`

**Utils**
  `target`, `getAttribute`, `isNameTaken`,
  `isPlayerNameTaken`, `primaryName`,
  `center` / `ljust` / `rjust`

**Core re-export**
  Everything listed stable in `@ursamu/core@^1.0`

## Evolving (may change in minor)

- `@restart` / codebase-update pin lists and override key sets
- Exact layout softcode **function subset** (additive only is
  preferred; removals of documented layout funcs are major)
- Individual admin verb exec signatures not listed above
- REST handler internals (`authHandler` shapes, rate-limit
  constants)
- `wsService` and `PluginConfigManager` compatibility stubs
- Verb `exec*` re-exports used primarily by tests/bridges

## Not in this package

Full building, channels comsys, mail, bbs, jobs, help file
trees — see `@ursamu/builder`, `@ursamu/channels`, and other
plugins.

## Host requirements

1. **Single mush instance** via import-map overrides
   (`docs/DUAL_PACKAGE.md`).
2. Depend on `@ursamu/core@^1.0.0` (already required here).
3. Softcode is TinyMUX-**oriented**, not a certified full clone
   (`docs/SOFTCODE.md`).

## Version policy

| Change | Bump |
|--------|------|
| Remove/rename stable export or change documented return | major |
| New softcode stdlib fn, format slot, additive SDK field | minor |
| Bugfix, docs, tests | patch |
