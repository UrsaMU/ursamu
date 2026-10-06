/** Damage resolution in rule order (Damage—Go Figure):
 * base -> + Success Levels -> - armor -> x type multiplier -> Life Points. */
import { armorDef, weaponDef } from "./data.ts";
import type { IArmor, IWeapon } from "./types.ts";

export type DmgType = "Bash" | "Slash/stab" | "Bullet";

/** Type multipliers vs a normal human. Bash x1, Slash/stab x2, Bullet x2. */
export const TYPE_MULT: Record<DmgType, number> = {
  "Bash": 1,
  "Slash/stab": 2,
  "Bullet": 2,
};

export function baseDamage(w: IWeapon, strength: number): number {
  if (w.dmg.fixed != null) return w.dmg.fixed;
  return w.dmg.mult! * (strength + (w.dmg.plus ?? 0));
}

export interface DamageInput {
  weapon: IWeapon | string;
  strength: number;
  successLevels: number;
  armor?: IArmor | string | null;
  /** Special-case multipliers (Bites, Through the Heart) replace the
   * ordinary Slash/stab multiplier when provided. */
  typeMultiplier?: number;
}

export interface DamageBreakdown {
  base: number;
  afterSl: number;
  afterArmor: number;
  multiplier: number;
  final: number;
  type: DmgType;
}

export function resolveDamage(input: DamageInput): DamageBreakdown {
  const w = typeof input.weapon === "string"
    ? weaponDef(input.weapon)
    : input.weapon;
  if (!w) {
    return {
      base: 0,
      afterSl: 0,
      afterArmor: 0,
      multiplier: 1,
      final: 0,
      type: "Bash",
    };
  }
  const a = input.armor == null
    ? null
    : typeof input.armor === "string"
    ? armorDef(input.armor)
    : input.armor;

  const base = baseDamage(w, input.strength);
  const afterSl = base + input.successLevels;
  const key = w.type === "Bash"
    ? "bash"
    : w.type === "Bullet"
    ? "bullet"
    : "slash";
  const av = a ? a.protection[key] : 0;
  const afterArmor = Math.max(0, afterSl - av);
  const multiplier = input.typeMultiplier ?? TYPE_MULT[w.type];
  return {
    base,
    afterSl,
    afterArmor,
    multiplier,
    final: afterArmor * multiplier,
    type: w.type,
  };
}
