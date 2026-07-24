// Apply goblin fruit effects to a sheet (inventory remove is separate).

import type { CofdSheet } from "../stats/sheet.ts";
import { healDamage } from "../health/track.ts";
import { addCondition } from "../subsystems/conditions.ts";
import {
  findFruit,
  type GoblinFruit,
} from "./fruit_catalog.ts";
import {
  readFruitFlags,
  removeOneFruit,
  writeFruitFlags,
} from "./fruit_inv.ts";

export interface EatResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  fruit?: GoblinFruit;
  lines: string[];
}

/** Apply catalog effects; caller already removed one fruit unit. */
export function applyFruitEffects(
  sheet: CofdSheet,
  fruit: GoblinFruit,
  now: number = Date.now(),
): EatResult {
  if (!fruit.edible) {
    return {
      ok: false,
      reason: `${fruit.name} is not eaten that way.`,
      lines: [],
    };
  }

  let next = sheet;
  const lines: string[] = [`You eat ${fruit.name}.`];
  let flags = readFruitFlags(next);

  for (const e of fruit.effects) {
    if (e.kind === "glamour") {
      const cur = next.energyCurrent ?? 0;
      const maxG = Math.max(10, (next.powerStatValue ?? 1) * 10);
      const gain = Math.min(e.amount, Math.max(0, maxG - cur));
      next = { ...next, energyCurrent: cur + gain };
      lines.push(`  Glamour +${gain} (now ${next.energyCurrent}).`);
    } else if (e.kind === "willpower") {
      const max = next.advantages?.willpowerMax ?? 0;
      const cur = next.advantages?.willpowerCurrent ?? 0;
      const gain = Math.min(e.amount, Math.max(0, max - cur));
      next = {
        ...next,
        advantages: {
          ...next.advantages,
          willpowerCurrent: cur + gain,
        },
      };
      lines.push(
        `  Willpower +${gain} (now ${cur + gain}/${max}).`,
      );
    } else if (e.kind === "heal") {
      const track = next.health ?? {
        bashing: 0,
        lethal: 0,
        aggravated: 0,
      };
      const healed = healDamage(track, e.amount, e.damage);
      next = { ...next, health: healed };
      lines.push(`  Healed ${e.amount} ${e.damage}.`);
    } else if (e.kind === "condition") {
      next = addCondition(next, e.key, e.note);
      lines.push(`  Condition: ${e.key}.`);
    } else if (e.kind === "flag") {
      const until = now + e.hours * 3600_000;
      flags = [
        ...flags.filter((f) => f.key !== e.key),
        { key: e.key, until },
      ];
      lines.push(`  Effect active ~${e.hours}h (${e.key}).`);
    } else if (e.kind === "note") {
      lines.push(`  ${e.text}`);
    }
  }

  next = writeFruitFlags(next, flags);
  return { ok: true, sheet: next, fruit, lines };
}

/**
 * Legacy sheet-satchel eat (pure tests). Live path uses objects.
 */
export function eatFruit(
  sheet: CofdSheet,
  slug: string,
  now: number = Date.now(),
): EatResult {
  const fruit = findFruit(slug);
  if (!fruit) {
    return { ok: false, reason: `Unknown fruit '${slug}'.`, lines: [] };
  }
  const rem = removeOneFruit(sheet, fruit.slug);
  if (!rem.ok) {
    return {
      ok: false,
      reason: `You are not carrying ${fruit.name}.`,
      lines: [],
    };
  }
  return applyFruitEffects(rem.sheet, fruit, now);
}
