// core/frenzy.ts -- Werewolf frenzy / berserk mechanics (pure functions).
//
// M20 frenzy rules:
//  - Trigger imposes a difficulty against a Willpower resist roll.
//  - 0 successes  -> frenzy (default berserk, may be fox under wyrm context).
//  - Botch        -> immediate berserk frenzy.
//  - >=1 success  -> resisted.
//  - Duration in turns = the character's rage rating.
//  - One turn = 6 seconds for real-time bookkeeping.
import type { IWoDChar } from "./types.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";

export const FRENZY_TURN_MS = 6_000;

export type FrenzyState = "berserk" | "fox";

export interface IFrenzyTrigger {
  difficulty: number;
  label: string;
}

/** Canonical M20 frenzy trigger table. Keys are command-friendly slugs. */
export const FRENZY_TRIGGERS: Record<string, IFrenzyTrigger> = {
  humiliation: { difficulty: 7, label: "Humiliation"                 },
  taunt:       { difficulty: 8, label: "Taunting / direct provocation" },
  "full-moon": { difficulty: 6, label: "Full moon"                   },
  wound:       { difficulty: 7, label: "Grievous wound"              },
  surprise:    { difficulty: 6, label: "Surprise attack"             },
  vampire:     { difficulty: 7, label: "Smell of vampires / Wyrm"    },
};

/** Frenzy duration in 6-second turns. Equals the character's rage rating. */
export function frenzyDuration(char: IWoDChar): number {
  return Math.max(0, char.rage ?? 0);
}

export interface IResistResult {
  ok: boolean;                  // true if successfully resisted
  roll: IDiceRoll;
  outcome: "resisted" | "berserk" | "fox";
  trigger: IFrenzyTrigger;
}

/**
 * Roll a Willpower resist against `triggerKey`.
 * `failureState` is the frenzy type applied on a 0-success result (default berserk).
 * Botch always results in berserk regardless.
 */
export function resistFrenzy(
  char: IWoDChar,
  triggerKey: string,
  failureState: FrenzyState = "berserk",
  rng: (pool: number, diff: number) => IDiceRoll = rollDice,
): IResistResult {
  const trigger = FRENZY_TRIGGERS[triggerKey];
  if (!trigger) throw new Error(`Unknown frenzy trigger: ${triggerKey}`);

  const pool = Math.max(1, char.willpower ?? 1);
  const roll = rng(pool, trigger.difficulty);

  if (roll.botch) {
    return { ok: false, roll, outcome: "berserk", trigger };
  }
  if (roll.netSuccesses === 0) {
    return { ok: false, roll, outcome: failureState, trigger };
  }
  return { ok: true, roll, outcome: "resisted", trigger };
}

/**
 * Mark `char` as frenzied. Returns a new IWoDChar copy.
 * `frenzyUntil` is computed from current time + rage turns * 6000ms.
 * Pass `indefinite=true` to set frenzyUntil=0 (sticky until cleared).
 */
export function enterFrenzy(
  char: IWoDChar,
  state: FrenzyState,
  indefinite = false,
  now: number = Date.now(),
): IWoDChar {
  if (state !== "berserk" && state !== "fox") {
    throw new Error(`Invalid frenzy state: ${state}`);
  }
  const turns = frenzyDuration(char);
  const until = indefinite || turns === 0 ? 0 : now + turns * FRENZY_TURN_MS;
  return { ...char, frenzyState: state, frenzyUntil: until };
}

/** Reset frenzy fields on `char`. Returns a new IWoDChar copy. */
export function clearFrenzy(char: IWoDChar): IWoDChar {
  return { ...char, frenzyState: null, frenzyUntil: 0 };
}

/**
 * True if `char` is currently considered frenzied.
 * Indefinite frenzy (frenzyUntil===0 with a state) is always active.
 */
export function isFrenzied(char: IWoDChar, now: number = Date.now()): boolean {
  if (!char.frenzyState) return false;
  if ((char.frenzyUntil ?? 0) === 0) return true;
  return (char.frenzyUntil ?? 0) > now;
}

/** Human-readable "Xs" / "Xm Ys" remaining string. */
export function frenzyRemaining(char: IWoDChar, now: number = Date.now()): string {
  if (!char.frenzyState) return "";
  const until = char.frenzyUntil ?? 0;
  if (until === 0) return "indefinite";
  const ms = until - now;
  if (ms <= 0) return "expired";
  const secs = Math.ceil(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return s === 0 ? `${m}m` : `${m}m ${s}s`;
}
