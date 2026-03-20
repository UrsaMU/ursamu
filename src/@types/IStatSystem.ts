/**
 * Interface for game-specific stat/attribute systems.
 *
 * Implement this in your game plugin and register it with
 * {@link registerStatSystem} so chargen/sheet commands can resolve stats
 * without importing engine internals.
 *
 * @example
 * ```ts
 * // In your game repo: plugins/vtm/stats.ts
 * import { registerStatSystem } from "jsr:@ursamu/ursamu";
 *
 * registerStatSystem({
 *   name: "vtm",
 *   version: "1.0.0",
 *   getCategories: () => ["Physical", "Social", "Mental", "Talents", "Skills", "Knowledges"],
 *   getStats: (cat) => cat === "Physical" ? ["Strength", "Dexterity", "Stamina"] : [],
 *   getStat: (actor, stat) => (actor as Record<string, unknown>)[stat.toLowerCase()] ?? 0,
 *   setStat: async (actor, stat, value) => { (actor as Record<string, unknown>)[stat.toLowerCase()] = value; },
 *   validate: (stat, value) => typeof value === "number" && value >= 0 && value <= 5,
 * });
 * ```
 */
export interface IStatSystem {
  /** Unique name for this stat system (e.g. `"vtm"`, `"cWoD"`, `"hero"`). */
  name: string;
  /** Semver string for the plugin's stat system version. */
  version: string;
  /** Return all stat category names (e.g. `["Physical", "Talents"]`). */
  getCategories(): string[];
  /**
   * Return stat names in a given category. If `category` is omitted, return
   * all stats across all categories.
   */
  getStats(category?: string): string[];
  /** Read a stat value from an actor object (as stored in `data`). */
  // deno-lint-ignore no-explicit-any
  getStat(actor: Record<string, unknown>, stat: string): any;
  /** Persist a stat value to an actor object. */
  setStat(actor: Record<string, unknown>, stat: string, value: unknown): Promise<void>;
  /**
   * Validate a prospective value for a stat.
   * Return `true` if valid, or a descriptive error string if not.
   */
  validate(stat: string, value: unknown): boolean | string;
}
