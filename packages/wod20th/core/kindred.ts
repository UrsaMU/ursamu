// core/kindred.ts -- VtM Kindred loop helpers (pure).
// Blood heal, feeding, torpor, Beast frenzy / Rötschreck resists.

import type { IWoDChar, DamageMark } from "./types.ts";
import { healDamage, getTrack } from "./health.ts";
import { isIncapacitated } from "./wounds.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import {
  enterFrenzy,
  clearFrenzy,
  isFrenzied,
  type FrenzyState,
} from "./frenzy.ts";
import { spendPool, regainPool, bloodPerTurnLimit } from "./pools.ts";
import { isStaked } from "./stake.ts";
import {
  frenzyDiffBonus,
  applyGangrelFrenzyScar,
} from "./clanWeakness.ts";

export interface IBeastTrigger {
  difficulty: number;
  label: string;
}

/** Self-Control resists (frenzy / the Beast). */
export const FRENZY_BEAST: Record<string, IBeastTrigger> = {
  hunger: { difficulty: 6, label: "Hunger / empty veins" },
  insult: { difficulty: 7, label: "Insult / humiliation" },
  wound: { difficulty: 6, label: "Grievous wound" },
  fire: { difficulty: 5, label: "Smell of fresh blood in frenzy" },
  taunt: { difficulty: 8, label: "Direct provocation" },
};

/** Courage resists (Rötschreck / Red Fear). */
export const ROTSCHRECK: Record<string, IBeastTrigger> = {
  fire: { difficulty: 6, label: "Open flame" },
  sunlight: { difficulty: 9, label: "Direct sunlight" },
  holy: { difficulty: 7, label: "Faith / holy symbols" },
  burn: { difficulty: 8, label: "Being burned" },
  surprise_fire: { difficulty: 7, label: "Sudden fire / explosion" },
};

export function isKindred(char: IWoDChar): boolean {
  return char.splat === "vtm";
}

export function isInTorpor(char: IWoDChar): boolean {
  if (!isKindred(char)) return false;
  if (char.inTorpor === true) return true;
  // Auto: Incap with L or A on the track.
  if (!isIncapacitated(char)) return false;
  const track = getTrack(char);
  return track.some((m) => m === "L" || m === "A");
}

/** Mark torpor when Kindred hits Incap with lethal/agg present. */
export function maybeEnterTorpor(char: IWoDChar): boolean {
  if (!isKindred(char)) return false;
  if (!isIncapacitated(char)) return false;
  const track = getTrack(char);
  if (!track.some((m) => m === "L" || m === "A")) return false;
  char.inTorpor = true;
  return true;
}

export function clearTorpor(char: IWoDChar): void {
  char.inTorpor = false;
}

/**
 * Gate Kindred actions. Returns reject message or null if ok.
 */
export function kindredBlockMessage(
  char: IWoDChar,
  actionLabel: string,
): string | null {
  if (!isKindred(char)) return null;
  if (isStaked(char)) {
    return `%crYou cannot ${actionLabel} while staked.%cn`;
  }
  if (isInTorpor(char)) {
    return `%crYou cannot ${actionLabel} while in torpor.%cn`;
  }
  if (isFrenzied(char)) {
    const w = char.frenzyState === "fox"
      ? "Rötschreck"
      : "frenzy";
    return `%crYou cannot ${actionLabel} while in ${w}.%cn`;
  }
  return null;
}

/**
 * When Blood hits 0, force a hunger frenzy resist (auto hook).
 * Returns null if no check needed. Caller applies outcome + saves.
 */
export function hungerFrenzyCheck(
  char: IWoDChar,
  rng: typeof rollDice = rollDice,
): IBeastResistResult | null {
  if (!isKindred(char)) return null;
  if (isFrenzied(char) || isInTorpor(char) || isStaked(char)) {
    return null;
  }
  const bp = char.bloodPool ?? 0;
  if (bp > 0) return null;
  return resistBeast(char, "frenzy", "hunger", rng);
}

/**
 * After aggravated (fire/sun) damage, optional Rötschreck check.
 */
export function hazardFearCheck(
  char: IWoDChar,
  trigger: "fire" | "sunlight" | "burn" = "fire",
  rng: typeof rollDice = rollDice,
): IBeastResistResult | null {
  if (!isKindred(char)) return null;
  if (isFrenzied(char) || isInTorpor(char) || isStaked(char)) {
    return null;
  }
  return resistBeast(char, "rotschreck", trigger, rng);
}

/** Count boxes of a damage type (or all filled). */
export function countDamage(
  char: IWoDChar,
  type: DamageMark | "all",
): number {
  const track = getTrack(char);
  if (type === "all") return track.filter((m) => m !== "").length;
  return track.filter((m) => m === type).length;
}

/**
 * Spend blood to heal bashing/lethal (V20: 1 BP -> 1 box B or L).
 * Prefers B then L. Use bloodHealAgg for aggravated.
 */
export function bloodHeal(
  char: IWoDChar,
  boxes: number,
): {
  ok: boolean;
  message: string;
  healed?: number;
  bloodLeft?: number;
  typeHealed?: "B" | "L" | "mixed";
} {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred heal with blood." };
  }
  if (boxes < 1 || !Number.isInteger(boxes)) {
    return { ok: false, message: "Heal amount must be a positive integer." };
  }
  const block = kindredBlockMessage(char, "heal");
  if (block) return { ok: false, message: block };

  const needB = countDamage(char, "B");
  const needL = countDamage(char, "L");
  const need = needB + needL;
  if (need < 1) {
    return {
      ok: false,
      message:
        "No bashing or lethal to heal. Agg: +blood/heal/agg",
    };
  }

  const want = Math.min(boxes, need, bloodPerTurnLimit(char));
  const spend = spendPool(char, "blood", want);
  if (!spend.ok || spend.remaining === undefined) {
    return { ok: false, message: spend.message };
  }

  let left = want;
  let healedB = 0;
  let healedL = 0;
  if (needB > 0 && left > 0) {
    healedB = healDamage(char, "B", Math.min(left, needB));
    left -= healedB;
  }
  if (needL > 0 && left > 0) {
    healedL = healDamage(char, "L", Math.min(left, needL));
    left -= healedL;
  }
  const healed = healedB + healedL;
  const used = healed;
  if (used < want) {
    char.bloodPool = spend.remaining + (want - used);
  } else {
    char.bloodPool = spend.remaining;
  }

  const typeHealed: "B" | "L" | "mixed" =
    healedB > 0 && healedL > 0
      ? "mixed"
      : healedL > 0
      ? "L"
      : "B";

  return {
    ok: true,
    message:
      `Healed ${healed} box${healed === 1 ? "" : "es"} ` +
      `(${typeHealed}) for ${used} Blood. ` +
      `(${char.bloodPool}/${char.bloodMax})`,
    healed,
    bloodLeft: char.bloodPool,
    typeHealed,
  };
}

/**
 * Agg heal: 5 Blood per box (V20 day-rest cost).
 * One box per call. Spends from pool only -- not bloodPerTurn
 * (rest healing is not a combat-turn spend).
 */
export function bloodHealAgg(
  char: IWoDChar,
  boxes = 1,
): {
  ok: boolean;
  message: string;
  healed?: number;
  bloodLeft?: number;
} {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred heal with blood." };
  }
  const block = kindredBlockMessage(char, "heal");
  if (block) return { ok: false, message: block };
  const n = Math.max(1, Math.floor(boxes));
  if (!Number.isFinite(n) || n < 1) {
    return { ok: false, message: "Heal amount must be a positive integer." };
  }
  const need = countDamage(char, "A");
  if (need < 1) {
    return { ok: false, message: "No aggravated damage to heal." };
  }
  const want = Math.min(n, need, 1);
  const cost = want * 5;
  const max = char.bloodMax ?? 0;
  const cur = char.bloodPool ?? max;
  if (cur < cost) {
    return {
      ok: false,
      message:
        `Need ${cost} Blood to heal aggravated ` +
        `(have ${cur}/${max}).`,
    };
  }
  char.bloodPool = cur - cost;
  const healed = healDamage(char, "A", want);
  return {
    ok: true,
    message:
      `Healed ${healed} aggravated for ${cost} Blood. ` +
      `(${char.bloodPool}/${max})`,
    healed,
    bloodLeft: char.bloodPool,
  };
}

/** Narrative feed: regain blood, capped at bloodMax. */
export function bloodFeed(
  char: IWoDChar,
  amount: number,
): { ok: boolean; message: string; current?: number } {
  if (!isKindred(char)) {
    return { ok: false, message: "Only Kindred feed on blood." };
  }
  const block = kindredBlockMessage(char, "feed");
  if (block) return { ok: false, message: block };
  const r = regainPool(char, "blood", amount);
  if (!r.ok || r.current === undefined) {
    return { ok: false, message: r.message };
  }
  char.bloodPool = r.current;
  return {
    ok: true,
    message: r.message,
    current: r.current,
  };
}

function virtuePool(char: IWoDChar, name: string): number {
  const v = char.virtues ?? {};
  // Base 1 + extras stored as total or extras? Chargen stores absolute dots.
  const n = v[name] ?? v[name.toLowerCase()];
  if (typeof n === "number" && n > 0) return n;
  return 1;
}

export interface IBeastResistResult {
  ok: boolean;
  roll: IDiceRoll;
  outcome: "resisted" | FrenzyState;
  trigger: IBeastTrigger;
  kind: "frenzy" | "rotschreck";
}

/**
 * Resist the Beast (frenzy) with Self-Control, or Rötschreck with Courage.
 */
export function resistBeast(
  char: IWoDChar,
  kind: "frenzy" | "rotschreck",
  triggerKey: string,
  rng: typeof rollDice = rollDice,
): IBeastResistResult {
  const table = kind === "frenzy" ? FRENZY_BEAST : ROTSCHRECK;
  const base = table[triggerKey];
  if (!base) {
    throw new Error(`Unknown ${kind} trigger: ${triggerKey}`);
  }
  let diff = base.difficulty;
  if (kind === "frenzy") {
    diff += frenzyDiffBonus(char);
  }
  const trigger: IBeastTrigger = {
    difficulty: Math.min(10, diff),
    label: base.label +
      (diff > base.difficulty
        ? ` (+${diff - base.difficulty} clan)`
        : ""),
  };
  // Paths with Instinct may use it for frenzy resists.
  let poolName = kind === "frenzy" ? "Self-Control" : "Courage";
  if (kind === "frenzy") {
    const path = (char.path ?? "Humanity").toLowerCase();
    if (
      path !== "humanity" &&
      char.virtues?.Instinct !== undefined &&
      char.virtues?.["Self-Control"] === undefined
    ) {
      poolName = "Instinct";
    }
  }
  const pool = Math.max(1, virtuePool(char, poolName));
  const roll = rng(pool, trigger.difficulty);
  const failState: FrenzyState = kind === "rotschreck" ? "fox" : "berserk";

  if (roll.botch || roll.netSuccesses <= 0) {
    return {
      ok: false,
      roll,
      outcome: failState,
      trigger,
      kind,
    };
  }
  return {
    ok: true,
    roll,
    outcome: "resisted",
    trigger,
    kind,
  };
}

export function applyBeastOutcome(
  char: IWoDChar,
  result: IBeastResistResult,
  indefinite = false,
): IWoDChar {
  if (result.ok || result.outcome === "resisted") {
    return char;
  }
  const next = enterFrenzy(char, result.outcome, indefinite);
  if (result.kind === "frenzy" && result.outcome === "berserk") {
    applyGangrelFrenzyScar(next);
  }
  return next;
}

export { clearFrenzy, isFrenzied, enterFrenzy };
