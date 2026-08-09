/**
 * Condition apply/remove and combat roll modifiers.
 */
import type { DndSheet } from "./dnd_sheet.ts";
import {
  conditionBySlug,
  type ConditionEntry,
} from "../data/catalog.ts";

export type AttackContext = {
  /** Attacker is making a ranged weapon/spell attack. */
  ranged?: boolean;
};

/** Expand slugs with nested effects (e.g. unconscious → prone). */
export function expandEffects(
  slugs: string[],
): Set<string> {
  const out = new Set<string>();
  const queue = [...slugs.map((s) => s.toLowerCase())];
  const seen = new Set<string>();
  while (queue.length) {
    const slug = queue.pop()!;
    if (seen.has(slug)) continue;
    seen.add(slug);
    const ent = conditionBySlug(slug);
    if (!ent) continue;
    for (const e of ent.effects) {
      if (e === "prone" && !seen.has("prone")) {
        queue.push("prone");
      } else {
        out.add(e);
      }
    }
  }
  return out;
}

export function hasCondition(
  sheet: DndSheet,
  slug: string,
): boolean {
  const t = slug.toLowerCase().trim();
  return (sheet.conditions ?? []).some((c) =>
    c.toLowerCase() === t
  );
}

export function addCondition(
  sheet: DndSheet,
  raw: string,
): { sheet: DndSheet; added: boolean; entry?: ConditionEntry } {
  const ent = conditionBySlug(raw);
  if (!ent) {
    return { sheet, added: false };
  }
  const s = structuredClone(sheet) as DndSheet;
  const list = [...(s.conditions ?? [])];
  if (list.some((c) => c.toLowerCase() === ent.slug)) {
    return { sheet: s, added: false, entry: ent };
  }
  list.push(ent.slug);
  s.conditions = list;
  // Unconscious at 0 is already tracked via HP; still allow tag.
  return { sheet: s, added: true, entry: ent };
}

export function removeCondition(
  sheet: DndSheet,
  raw: string,
): { sheet: DndSheet; removed: boolean } {
  const ent = conditionBySlug(raw);
  const slug = ent?.slug ?? raw.toLowerCase().trim();
  const s = structuredClone(sheet) as DndSheet;
  const before = s.conditions?.length ?? 0;
  s.conditions = (s.conditions ?? []).filter((c) =>
    c.toLowerCase() !== slug
  );
  return {
    sheet: s,
    removed: (s.conditions?.length ?? 0) < before,
  };
}

export type AdvState = "normal" | "advantage" | "disadvantage";

/**
 * Combine attacker/defender condition tags into attack roll adv.
 * Exhaustion 3+ also imposes disadvantage on attacks.
 */
export function attackRollAdv(
  attacker: DndSheet,
  defender: DndSheet,
  ctx: AttackContext = {},
): AdvState {
  const atk = expandEffects(attacker.conditions ?? []);
  const def = expandEffects(defender.conditions ?? []);
  let adv = 0;
  let dis = 0;

  if (atk.has("attack_disadvantage")) dis += 1;
  if (atk.has("attack_advantage")) adv += 1;
  if ((attacker.exhaustion ?? 0) >= 3) dis += 1;

  if (def.has("attacks_against_advantage")) adv += 1;
  if (def.has("attacks_against_disadvantage")) dis += 1;
  if (def.has("melee_against_advantage") && !ctx.ranged) {
    adv += 1;
  }
  if (def.has("ranged_against_disadvantage") && ctx.ranged) {
    dis += 1;
  }

  if (adv > 0 && dis > 0) return "normal";
  if (adv > 0) return "advantage";
  if (dis > 0) return "disadvantage";
  return "normal";
}

export function abilityCheckAdv(sheet: DndSheet): AdvState {
  const fx = expandEffects(sheet.conditions ?? []);
  let dis = 0;
  if (fx.has("ability_disadvantage")) dis += 1;
  if ((sheet.exhaustion ?? 0) >= 1) dis += 1;
  return dis > 0 ? "disadvantage" : "normal";
}

/** Effective speed after grappled/restrained/exhaustion. */
export function effectiveSpeed(sheet: DndSheet): number {
  const fx = expandEffects(sheet.conditions ?? []);
  if (fx.has("speed_zero") || (sheet.exhaustion ?? 0) >= 5) {
    return 0;
  }
  let spd = sheet.speed ?? 30;
  if ((sheet.exhaustion ?? 0) >= 2) spd = Math.floor(spd / 2);
  return spd;
}
