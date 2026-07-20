/**
 * Runtime combat config (brains order, defaults).
 * Games may set via setCombatConfig() or plugins.combat in host config.
 */
export interface CombatConfig {
  /**
   * Brain ids to try, in order. Unknown ids are skipped.
   * Default: registration order (usually ["json"]).
   */
  brains?: string[];
  /**
   * Default aiKey when NPC has none (system may override in loadActor).
   */
  defaultAiKey?: string;
  /**
   * When true (default), emit combat:decide before brains so
   * ai-gm / plugins can claim the turn without a hard dependency.
   */
  enableDecideHook?: boolean;
}

const DEFAULTS: Required<CombatConfig> = {
  brains: [],
  defaultAiKey: "",
  enableDecideHook: true,
};

let _config: Required<CombatConfig> = { ...DEFAULTS };

export function setCombatConfig(partial: CombatConfig): void {
  _config = {
    ..._config,
    ...partial,
    brains: partial.brains
      ? [...partial.brains]
      : _config.brains,
  };
}

export function getCombatConfig(): Readonly<Required<CombatConfig>> {
  return _config;
}

export function resetCombatConfig(): void {
  _config = { ...DEFAULTS, brains: [] };
}
