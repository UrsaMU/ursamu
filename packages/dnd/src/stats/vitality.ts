/**
 * Vitality barrel — HP, death, rest.
 */
export {
  applyDamage,
  applyHeal,
  deathOf,
  defaultDeath,
  formatDeathStatus,
  isDead,
  isDying,
  isIncapacitated,
  isUnconscious,
  rollDeathSave,
  stabilize,
  type DamageResult,
  type DeathSaveResult,
  type DeathState,
} from "./death.ts";

export {
  longRest,
  shortRest,
  type RestResult,
} from "./rest.ts";
