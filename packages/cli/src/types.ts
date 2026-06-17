/**
 * src/cli/types.ts
 *
 * Shared type definitions for the UrsaMU CLI plugin manager.
 */

/** Manifest shipped by plugin repos as `ursamu.plugin.json` at the repo root. */
export interface PluginManifest {
  /** Directory-safe slug used as the install folder name. */
  name: string;
  /** Semver string, e.g. "1.2.3". */
  version: string;
  description: string;
  /** Semver range this plugin requires, e.g. ">=1.0.0". */
  ursamu: string;
  author?: string;
  license?: string;
  /** Entry-point file (relative to repo root). Defaults to "index.ts". */
  main?: string;
  /** Searchable tags, e.g. ["ai", "chargen", "discord"]. */
  tags?: string[];
}

/** One entry in the local plugin registry. */
export interface RegistryEntry {
  name: string;
  version: string;
  description: string;
  /** Original clone URL. Used by `update`. */
  source: string;
  author: string;
  /** The git tag, branch, or commit SHA this entry was installed/updated from. */
  ref?: string;
  /** ISO-8601 timestamp of first install. */
  installedAt: string;
  /** ISO-8601 timestamp of last update. */
  updatedAt: string;
}

/** The full registry map: plugin name → entry. */
export type Registry = Record<string, RegistryEntry>;

// ─── remote (hosted) registry ─────────────────────────────────────────────────

/** One entry in the hosted community plugin registry. */
export interface RemotePluginEntry {
  /** Unique slug matching the plugin's `ursamu.plugin.json` `name` field. */
  name: string;
  description: string;
  /** Minimum UrsaMU version required, e.g. ">=1.5.0". */
  ursamu: string;
  /** GitHub (or any git-clonable) URL. */
  url: string;
  /** Latest published version. */
  version: string;
  author: string;
  /** Searchable tags, e.g. ["ai", "chargen", "discord"]. */
  tags?: string[];
}

/** Shape of the hosted `registry.json` manifest. */
export interface RemoteRegistry {
  /** Schema version — currently "1". */
  version: string;
  plugins: RemotePluginEntry[];
}
