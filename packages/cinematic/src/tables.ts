/** Table renderers: rolls, maneuvers, type budgets. */
import { MANEUVERS } from "./data.ts";
import { CHAR_TYPES } from "./data.ts";
import { slLabel, successLevels } from "./rules.ts";

export interface IRollResult {
  roll: number;
  modifiers: number;
  total: number;
  sl: number;
  label: string;
}

function y(s: string): string {
  return `%cy${s}%cn`;
}

export function formatRoll(
  who: string,
  attr: string,
  skill: string,
  r: IRollResult,
): string {
  const verdict = r.sl > 0
    ? y(`${r.sl} SL — ${r.label}`)
    : `%crFailure%cn`;
  const mod = r.modifiers
    ? ` ${r.modifiers >= 0 ? "+" : ""}${r.modifiers}`
    : "";
  return (
    `${who} rolls ${attr}${skill ? ` + ${skill}` : ""}: ` +
    `[${r.roll}]${mod} = %ch${r.total}%cn  ${verdict}`
  );
}

export function formatManeuvers(): string {
  const lines = [
    `%ch${"MANEUVER".padEnd(20)}${"ROLL".padEnd(34)}DAMAGE%cn`,
  ];
  for (const m of MANEUVERS) {
    lines.push(
      ` ${m.name.padEnd(19)} ${m.roll.padEnd(33)} ${m.damage}` +
        ` (${m.type})`,
    );
  }
  return lines.join("%r");
}

export function formatTypes(): string {
  const lines = [`%ch${"TYPE".padEnd(18)}ATTR QUAL SKILL DRAMA%cn`];
  for (const t of CHAR_TYPES) {
    lines.push(
      ` ${t.name.padEnd(17)} ${String(t.attrPoints).padStart(4)}` +
        ` ${String(t.qualityPoints).padStart(4)}` +
        ` ${String(t.skillPoints).padStart(5)}` +
        ` ${String(t.dramaPoints).padStart(6)}`,
    );
  }
  return lines.join("%r");
}

export function rollFromTotal(total: number): IRollResult {
  const sl = successLevels(total);
  return {
    roll: 0,
    modifiers: 0,
    total,
    sl,
    label: slLabel(sl),
  };
}
