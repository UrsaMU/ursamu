// Clash of Wills (CtL / CofD) — pure pool builder.

import type { CofdSheet } from "../stats/sheet.ts";
import { ownMantle } from "./mantle.ts";

export interface ClashPools {
  attackerPool: number;
  defenderPool: number;
  attackerLabel: string;
  defenderLabel: string;
}

/**
 * Default Clash: power stat + (Resolve or Composure, higher).
 * Changelings use Wyrd; optional Mantle when court magic.
 */
export function buildClashPools(
  attacker: CofdSheet,
  defender: CofdSheet,
  opts: { useMantle?: boolean } = {},
): ClashPools {
  const aPower = Math.max(0, attacker.powerStatValue || 0);
  const dPower = Math.max(0, defender.powerStatValue || 0);
  const aRes = Math.max(
    attacker.attributes?.resolve ?? 1,
    attacker.attributes?.composure ?? 1,
  );
  const dRes = Math.max(
    defender.attributes?.resolve ?? 1,
    defender.attributes?.composure ?? 1,
  );
  let aPool = aPower + aRes;
  const dPool = dPower + dRes;
  let aLab =
    `Power(${aPower})+Res/Com(${aRes})`;
  const dLab =
    `Power(${dPower})+Res/Com(${dRes})`;
  if (opts.useMantle) {
    const m = ownMantle(attacker);
    if (m > 0) {
      aPool += m;
      aLab += `+Mantle(${m})`;
    }
  }
  return {
    attackerPool: Math.max(0, aPool),
    defenderPool: Math.max(0, dPool),
    attackerLabel: aLab,
    defenderLabel: dLab,
  };
}

export type ClashWinner = "attacker" | "defender" | "tie";

export function resolveClashOutcome(
  aSucc: number,
  dSucc: number,
): ClashWinner {
  if (aSucc > dSucc) return "attacker";
  if (dSucc > aSucc) return "defender";
  return "tie";
}
