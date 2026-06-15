// Plugin-scoped runtime configuration.
//
// Read from two locations and merged together:
//
//   1. `config/config.json` — the main ursamu engine config. The plugin
//      looks for a `plugins.map` block; whatever it finds there wins.
//      This is the deployer-facing knob — operators configure plugins
//      through the engine config they already manage.
//
//   2. `config/map.json` — plugin-local defaults. Useful for shipping a
//      sensible default in the plugin repo / package without forcing
//      every deployment to touch the engine config.
//
// Engine config wins per-key, falling back to local when a key is absent.
//
// Resolver precedence for `resolveDefaultCommandToggle` (high → low):
//   1. explicit `opts` arg to `registerDefaultCommands(opts)`
//   2. env var `URSAMU_MAP_DISABLE_DEFAULT_COMMANDS=1` (kills both)
//   3. merged config: engine config > local config
//   4. hardcoded defaults (register both)

export interface MapPluginConfig {
  /**
   * Per-command registration toggle for the bundled commands.
   * Missing or true → register. False → skip.
   */
  defaultCommands?: {
    map?: boolean;
    move?: boolean;
  };
}

const ENGINE_CONFIG_PATH = "./config/config.json";
const LOCAL_CONFIG_PATH = "./config/map.json";

interface EngineConfigShape {
  plugins?: { map?: MapPluginConfig };
}

let cached: MapPluginConfig | null = null;
let cacheValid = false;

function readJson<T>(path: string): T | null {
  try {
    const txt = Deno.readTextFileSync(path);
    const parsed = JSON.parse(txt);
    return (parsed && typeof parsed === "object") ? parsed as T : null;
  } catch {
    return null;
  }
}

function loadEngineSection(): MapPluginConfig {
  const cfg = readJson<EngineConfigShape>(ENGINE_CONFIG_PATH);
  return cfg?.plugins?.map ?? {};
}

function loadLocalConfig(): MapPluginConfig {
  return readJson<MapPluginConfig>(LOCAL_CONFIG_PATH) ?? {};
}

function mergeConfigs(local: MapPluginConfig, engine: MapPluginConfig): MapPluginConfig {
  return {
    defaultCommands: {
      ...(local.defaultCommands ?? {}),
      ...(engine.defaultCommands ?? {}),
    },
  };
}

/**
 * Read both config files and return the merged result. Engine config
 * (`config/config.json` → `plugins.map`) wins per-key over local
 * (`config/map.json`). Cached for the lifetime of the process; call
 * {@link invalidatePluginConfigCache} after writing a config file in a test.
 */
export function getPluginConfigSync(): MapPluginConfig {
  if (cacheValid && cached) return cached;
  cached = mergeConfigs(loadLocalConfig(), loadEngineSection());
  cacheValid = true;
  return cached;
}

/** Test-only: drop the cached config so the next call re-reads from disk. */
export function invalidatePluginConfigCache(): void {
  cached = null;
  cacheValid = false;
}

/**
 * Resolve whether the bundled `+map` / `+move` should register. Honors
 * (in order): the explicit `opts` arg, the env-var kill switch, the merged
 * config (engine > local), then the default (register both).
 */
export function resolveDefaultCommandToggle(
  opts?: { map?: boolean; move?: boolean },
): { map: boolean; move: boolean } {
  let envKill = false;
  try {
    envKill = Deno.env.get("URSAMU_MAP_DISABLE_DEFAULT_COMMANDS") === "1";
  } catch {
    /* env access denied — treat as not set */
  }
  const merged = getPluginConfigSync().defaultCommands ?? {};
  return {
    map: opts?.map ?? (envKill ? false : (merged.map ?? true)),
    move: opts?.move ?? (envKill ? false : (merged.move ?? true)),
  };
}
