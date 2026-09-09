// core/beastApply.ts -- Format + apply auto Beast checks.

import type { IWoDChar } from "./types.ts";
import {
  applyBeastOutcome,
  type IBeastResistResult,
} from "./kindred.ts";

export function formatBeastRoll(r: IBeastResistResult): string {
  const pool = r.kind === "frenzy" ? "Self-Control" : "Courage";
  return (
    `${pool} (${r.roll.pool}d vs ${r.trigger.difficulty}): ` +
    `[${r.roll.dice.join(" ")}] = ${r.roll.netSuccesses}` +
    `${r.roll.botch ? " BOTCH" : ""}`
  );
}

/** Apply failed resist; returns lines to send + whether frenzy entered. */
export function resolveBeastCheck(
  char: IWoDChar,
  result: IBeastResistResult,
): { lines: string[]; entered: boolean } {
  const lines = [`%cy${formatBeastRoll(result)}%cn`];
  if (result.ok) {
    lines.push(
      `%cgYou master the Beast (${result.trigger.label}).%cn`,
    );
    return { lines, entered: false };
  }
  const next = applyBeastOutcome(char, result);
  Object.assign(char, next);
  const label = result.kind === "rotschreck" ? "Rötschreck" : "frenzy";
  lines.push(`%crYou succumb to ${label}!%cn`);
  return { lines, entered: true };
}
