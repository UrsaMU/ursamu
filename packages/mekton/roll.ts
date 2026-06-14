import { gameHooks } from "@ursamu/ursamu";

export interface IInterlockRoll {
  statValue: number;
  skillValue: number;
  d10: number;       // raw die result (after crit chain resolution)
  total: number;     // statValue + skillValue + d10
  critical: "success" | "failure" | null;
  chainRolls: number[]; // intermediate rolls in a crit chain
}

export interface IMektonRollEvent {
  playerId: string;
  playerName: string;
  roomId: string;
  statName: string;
  skillName: string;
  statValue: number;
  skillValue: number;
  roll: number;
  total: number;
  difficulty?: number;
  success?: boolean;
  critical: "success" | "failure" | null;
  summary: string;
}

/** Roll a single D10. */
function d10(): number {
  return Math.ceil(Math.random() * 10);
}

/**
 * Roll Interlock: STAT + SKILL + 1D10.
 * Crit success on 10: roll again, add (chain on consecutive 10s).
 * Crit failure on 1: roll again, subtract once.
 */
export function rollInterlock(statValue: number, skillValue: number): IInterlockRoll {
  const chainRolls: number[] = [];
  let first = d10();
  chainRolls.push(first);

  let critical: "success" | "failure" | null = null;
  let extraD10 = 0;

  if (first === 10) {
    critical = "success";
    let next = d10();
    chainRolls.push(next);
    extraD10 += next;
    while (next === 10) {
      next = d10();
      chainRolls.push(next);
      extraD10 += next;
    }
  } else if (first === 1) {
    critical = "failure";
    const subtract = d10();
    chainRolls.push(subtract);
    extraD10 -= subtract;
    first = 1; // keep first as 1; net d10 = 1 - subtract
  }

  const d10Result = first + extraD10;
  const total = statValue + skillValue + d10Result;

  return { statValue, skillValue, d10: d10Result, total, critical, chainRolls };
}

/** Parse a damage string like "2D6" or "1D10" into a numeric sum. */
export function rollDamage(diceExpr: string): number {
  const match = diceExpr.match(/^(\d+)[Dd](\d+)([+-]\d+)?/);
  if (!match) return 0;
  const count = parseInt(match[1], 10);
  const sides = parseInt(match[2], 10);
  const bonus = match[3] ? parseInt(match[3], 10) : 0;
  let total = bonus;
  for (let i = 0; i < count; i++) {
    total += Math.ceil(Math.random() * sides);
  }
  return Math.max(0, total);
}

/** Difficulty label from threshold number. */
export function difficultyLabel(dn: number): string {
  if (dn <= 10) return "Easy (10)";
  if (dn <= 15) return "Average (15)";
  if (dn <= 20) return "Difficult (20)";
  if (dn <= 25) return "Very Difficult (25)";
  return "Nearly Impossible (30)";
}

/** Emit a mekton:roll event for the AI GM bridge. */
export function emitRollEvent(payload: IMektonRollEvent): void {
  (gameHooks.emit as (e: string, p: unknown) => void)("mekton:roll", payload);
}
