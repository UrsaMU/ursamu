/**
 * Action rolls — 2d6 + stat + bonuses vs Difficulty Score.
 * Dangerous rolls: margin = Resilience damage to loser.
 */
import {
  type DiceMode,
  type IDiceResult,
  netMode,
  roll2d6,
} from "./dice.ts";
import type {
  ISprawlChar,
  SprawlItemData,
  StatKey,
} from "../db/schemas.ts";
import { overloadFrom } from "../db/schemas.ts";
import {
  attackModeTags,
  combatGearBonusFromItems,
  loadFromItems,
  type CombatGearBonus,
  type CombatGearOpts,
} from "./items.ts";
import {
  effectiveLoadoutMax,
  wornStatBonuses,
} from "./worn-gear.ts";
import { criticalStatPenalty } from "./damage.ts";

export { attackModeTags, effectiveLoadoutMax, wornStatBonuses };
export type { CombatGearBonus, CombatGearOpts };

export interface IActionInput {
  stat: StatKey;
  statValue: number;
  bonuses: number;
  ds: number;
  glitch?: number;
  upgrade?: number;
  dangerous?: boolean;
  /** Extra label bits for display. */
  tags?: string[];
}

export interface IActionResult {
  dice: IDiceResult;
  mode: DiceMode;
  stat: StatKey;
  statValue: number;
  bonuses: number;
  total: number;
  ds: number;
  success: boolean;
  margin: number;
  damageToTarget: number;
  damageToSelf: number;
  needNerveCheck: boolean;
  tags: string[];
}

export function resolveAction(
  input: IActionInput,
  rng?: () => number,
): IActionResult {
  const mode = netMode(input.glitch ?? 0, input.upgrade ?? 0);
  const dice = roll2d6(mode, rng);
  const total = dice.total + input.statValue + input.bonuses;
  const success = total >= input.ds;
  const margin = Math.abs(total - input.ds);
  const dangerous = !!input.dangerous;
  return {
    dice,
    mode,
    stat: input.stat,
    statValue: input.statValue,
    bonuses: input.bonuses,
    total,
    ds: input.ds,
    success,
    margin,
    damageToTarget: dangerous && success ? margin : 0,
    damageToSelf: dangerous && !success ? margin : 0,
    needNerveCheck: dice.doubleOne,
    tags: input.tags ?? [],
  };
}

/**
 * Aug + worn gear + overload modifiers for a stat roll.
 * Pass gear/console bonuses via `extra` / `extraParts`.
 * Pass `carriedLoad` + `items` when inventory is Things-based
 * so worn power armor / coil suits count.
 */
export function gatherBonuses(
  c: ISprawlChar,
  stat: StatKey,
  extra = 0,
  extraParts: string[] = [],
  carriedLoad?: number,
  // deno-lint-ignore no-explicit-any
  items?: ReadonlyArray<any>,
): { total: number; parts: string[] } {
  const parts = [...extraParts];
  let total = extra;
  if (extra && !extraParts.length) parts.push(`extra +${extra}`);

  for (const a of c.augs) {
    if (a.modStat === stat && (a.mod ?? 0) > 0) {
      total += a.mod!;
      parts.push(`${a.name} +${a.mod}`);
    }
  }

  if (items?.length) {
    const worn = wornStatBonuses(items, stat);
    total += worn.total;
    parts.push(...worn.parts);
  }

  const critPen = criticalStatPenalty(c, stat);
  total += critPen.total;
  parts.push(...critPen.parts);

  const used = carriedLoad ??
    loadFromItems(c.loadout ?? []);
  const max = items?.length
    ? effectiveLoadoutMax(c.loadoutMax, items)
    : c.loadoutMax;
  const over = overloadFrom(used, max);
  if (
    over > 0 &&
    (stat === "morphology" || stat === "reaction")
  ) {
    total -= over;
    parts.push(`overload -${over}`);
  }

  return { total, parts };
}

/**
 * Host gear bonuses + installed mods matching action tags.
 * Pass actionTags from attackModeTags(+attack mode).
 */
export function combatGearBonus(
  // deno-lint-ignore no-explicit-any
  items: ReadonlyArray<SprawlItemData | Record<string, any>>,
  opts: CombatGearOpts = {},
): CombatGearBonus {
  return combatGearBonusFromItems(items, opts);
}

export function backgroundBonus(
  c: ISprawlChar,
  relevant: boolean,
): number {
  return relevant && c.background ? 1 : 0;
}

export function applyResilience(
  c: ISprawlChar,
  delta: number,
): ISprawlChar {
  const next = Math.max(
    0,
    Math.min(c.resilienceMax, c.resilience + delta),
  );
  return { ...c, resilience: next };
}

export function formatDice(d: IDiceResult): string {
  const shown = d.dice.join("+");
  const kept = `${d.kept[0]}+${d.kept[1]}`;
  let s = `[${shown}] keep ${kept}`;
  if (d.explodeBonus) s += ` explode +${d.explodeBonus}`;
  if (d.mode !== "normal") s += ` (${d.mode})`;
  return s;
}
