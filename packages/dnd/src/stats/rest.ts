/**
 * D&D 5e short / long rest.
 */
import { getAbilityMod, type DndSheet } from "./dnd_sheet.ts";
import { classBySlug } from "../data/catalog.ts";
import {
  defaultDeath,
  deathOf,
  isDying,
} from "./death.ts";

export type RestResult = {
  sheet: DndSheet;
  lines: string[];
  ok: boolean;
};

function primaryHitDie(sheet: DndSheet): number {
  const keys = Object.keys(sheet.classes ?? {});
  if (!keys.length) return 8;
  return classBySlug(keys[0].toLowerCase())?.hitDie ?? 8;
}

/** Short rest: spend hit dice (blocked if dead or dying). */
export function shortRest(
  sheet: DndSheet,
  diceCount: number,
  rng: () => number = Math.random,
): RestResult {
  const s = structuredClone(sheet) as DndSheet;
  const death = deathOf(s);

  if (death.dead) {
    return {
      sheet: s,
      lines: ["Dead — cannot rest."],
      ok: false,
    };
  }
  if (isDying(s)) {
    return {
      sheet: s,
      lines: [
        "Dying — stabilize or heal before a short rest.",
      ],
      ok: false,
    };
  }

  let n = Math.floor(diceCount);
  if (!Number.isFinite(n) || n <= 0) n = 1;
  if (s.hitDice.current < n) {
    return {
      sheet: s,
      lines: [
        `Only ${s.hitDice.current} Hit Dice left ` +
          `(tried ${n}).`,
      ],
      ok: false,
    };
  }

  const die = primaryHitDie(s);
  const con = getAbilityMod(s.abilities.constitution ?? 10);
  let total = 0;
  const rolls: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = Math.floor(rng() * die) + 1;
    rolls.push(r);
    total += Math.max(1, r + con);
  }

  s.hitDice.current -= n;
  const before = s.hp.current;
  s.hp.current = Math.min(s.hp.max, before + total);
  const healed = s.hp.current - before;

  if (s.hp.current > 0) s.death = defaultDeath();
  else s.death = death;

  const rollStr = rolls.map((r) => `d${die}(${r})`).join("+");
  return {
    sheet: s,
    ok: true,
    lines: [
      `Short rest: spent ${n} HD. ${rollStr}+Con×${n} ` +
        `(${con * n})=${total}. Healed ${healed} ` +
        `(${s.hp.current}/${s.hp.max} HP, HD ` +
        `${s.hitDice.current}/${s.hitDice.max}).`,
    ],
  };
}

/** Long rest: full HP, half HD (min 1), slots, clear death. */
export function longRest(sheet: DndSheet): RestResult {
  const s = structuredClone(sheet) as DndSheet;
  const death = deathOf(s);

  if (death.dead) {
    return {
      sheet: s,
      lines: ["Dead — cannot rest."],
      ok: false,
    };
  }
  if (isDying(s)) {
    return {
      sheet: s,
      lines: [
        "Dying — stabilize or heal before a long rest.",
      ],
      ok: false,
    };
  }

  const hpBefore = s.hp.current;
  const hdBefore = s.hitDice.current;
  s.hp.current = s.hp.max;
  s.hp.temp = 0;

  for (let i = 1; i <= 9; i++) {
    s.spellSlotsCurrent[i] = s.spellSlotsMax[i] || 0;
  }

  const restore = Math.max(1, Math.floor(s.hitDice.max / 2));
  s.hitDice.current = Math.min(
    s.hitDice.max,
    s.hitDice.current + restore,
  );
  s.death = defaultDeath();
  // PHB: long rest reduces exhaustion by 1
  const exhBefore = s.exhaustion ?? 0;
  if (exhBefore > 0) {
    s.exhaustion = exhBefore - 1;
  }

  const exhNote = exhBefore > 0
    ? ` Exhaustion ${exhBefore}→${s.exhaustion}.`
    : "";

  return {
    sheet: s,
    ok: true,
    lines: [
      `Long rest: HP ${hpBefore}→${s.hp.current}, ` +
        `HD ${hdBefore}→${s.hitDice.current}/${s.hitDice.max}, ` +
        `slots restored, death state cleared.${exhNote}`,
    ],
  };
}
