/**
 * @module @ursamu/cli
 *
 * UrsaMU command-line tools: project scaffolding, plugin management,
 * engine update, and shell script management.
 *
 * Entry points (run directly with deno run -A):
 *   src/ursamu.ts   — interactive CLI dispatcher
 *   src/create.ts   — project + plugin scaffolding
 *   src/plugin.ts   — plugin install / update / remove / list / info
 *   src/update.ts   — engine version upgrade
 *   src/scripts.ts  — shell script management
 *   src/client.ts   — local dev telnet client
 *
 * Exported for programmatic use:
 */

// Scaffolding functions
export { scaffoldProject }                      from "./src/create-project.ts";
export { scaffoldPlugin }                       from "./src/create-plugin.ts";
export type { PluginScaffoldOpts }              from "./src/create-plugin.ts";

// Data / templates
export { GAME_PROJECT_TASKS, DEFAULT_PLUGINS_MANIFEST } from "./src/game-project-tasks.ts";
export * as templates                           from "./src/create-templates.ts";

// Types shared across CLI modules
export type {
  PluginManifest,
  RegistryEntry,
  Registry,
  RemotePluginEntry,
  RemoteRegistry,
}                                               from "./src/types.ts";

// Plugin security guards and git clone helpers
export {
  buildCloneArgs,
  buildCloneSteps,
  isSafePluginName,
  isSafePluginUrl,
  isShaRef,
  runGitStep,
}                                               from "./src/plugin-security.ts";
export type {
  ManifestEntry,
  PluginDep,
  PluginsManifest,
}                                               from "./src/plugin-security.ts";

// Plugin installer errors
export {
  PluginInstallError,
  PluginDepNameError,
  PluginDepUrlError,
  PluginCloneError,
  PluginRenameError,
  PluginVersionError,
  PluginSemverError,
  PluginConflictError,
}                                               from "./src/pluginErrors.ts";

// Semver helpers
export {
  parseRangeOrThrow,
  parseVersionOrThrow,
  checkSatisfies,
}                                               from "./src/pluginSemver.ts";

// Transaction
export { InstallTxn }                           from "./src/pluginTxn.ts";
export type { TxnRecord, TxnDirRecord, TxnRegRecord } from "./src/pluginTxn.ts";

// Dependency resolver
export {
  readPluginMeta,
  readPluginVersion,
  makeDefaultCtx,
  resolveDeps,
  verifyDepRanges,
}                                               from "./src/pluginDeps.ts";
export type { ResolveDepsCtx }                  from "./src/pluginDeps.ts";

// Clone / install
export { cloneAndMove }                         from "./src/pluginDepsInstall.ts";
export type { CloneAndMoveCtx }                 from "./src/pluginDepsInstall.ts";

// High-level ensure
export { ensurePlugins }                        from "./src/ensurePlugins.ts";
