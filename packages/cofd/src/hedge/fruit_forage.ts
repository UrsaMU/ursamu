// Forage for goblin fruit — pure pick; objects created by command layer.

import type { CofdSheet } from "../stats/sheet.ts";
import { effectiveAttr, effectiveSkill } from "../stats/effective.ts";
import { isChangelingSheet } from "../form/mask.ts";
import {
  findFruit,
  pickForageFruit,
  type GoblinFruit,
} from "./fruit_catalog.ts";
import { hasFruitFlag } from "./fruit_inv.ts";
import type { HedgeRoom } from "./types.ts";

export interface ForageInput {
  sheet: CofdSheet;
  room: HedgeRoom | null;
  inHedge: boolean;
  successes: number;
  exceptional: boolean;
  dramaticFailure: boolean;
  rng?: () => number;
}

export interface ForageResult {
  ok: boolean;
  reason?: string;
  /** Fruit to spawn as object (caller creates). */
  fruit?: GoblinFruit;
  pool: number;
  lines: string[];
}

export function foragePool(sheet: CofdSheet): number {
  let pool = effectiveAttr(sheet, "wits") +
    effectiveSkill(sheet, "survival");
  if ((sheet.conditions ?? []).some((c) => c.key === "lost")) {
    pool -= 2;
  }
  if (hasFruitFlag(sheet, "faeriePeach")) pool += 1;
  return Math.max(0, pool);
}

/** Resolve forage roll → which fruit (if any). No inventory mutate. */
export function resolveForage(input: ForageInput): ForageResult {
  const {
    sheet,
    room,
    inHedge,
    successes,
    exceptional,
    dramaticFailure,
    rng = Math.random,
  } = input;
  const pool = foragePool(sheet);
  const lines: string[] = [];

  if (!isChangelingSheet(sheet)) {
    return {
      ok: false,
      reason: "Only the Lost harvest goblin fruit this way.",
      pool,
      lines,
    };
  }
  if (!inHedge) {
    return {
      ok: false,
      reason: "Forage only works inside the Hedge.",
      pool,
      lines,
    };
  }

  if (dramaticFailure) {
    lines.push(
      "The brambles snag and mislead you. Nothing edible — " +
        "and the path feels wrong.",
    );
    return { ok: true, pool, lines };
  }

  if (successes <= 0) {
    lines.push("You find only leaves and thorns.");
    return { ok: true, pool, lines };
  }

  let fruit = pickForageFruit(exceptional, rng);
  if (room?.danger === "thorns" && !exceptional && rng() < 0.35) {
    fruit = findFruit("ogre-pepper") ?? fruit;
  }
  if (room?.danger === "trod" && fruit.rarity === "exceptional") {
    if (rng() < 0.5) fruit = findFruit("common-fruit") ?? fruit;
  }

  lines.push(
    `You harvest %cy${fruit.name}%cn (${fruit.rarity}).`,
  );
  lines.push(`  ${fruit.effect}`);
  return { ok: true, fruit, pool, lines };
}
