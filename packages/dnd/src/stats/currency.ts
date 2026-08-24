/**
 * Multi-coin purse (cp/sp/ep/gp/pp) with gp-equivalent total.
 */
import type { DndSheet } from "./dnd_sheet.ts";

export type Coin = "cp" | "sp" | "ep" | "gp" | "pp";

export const COIN_TO_CP: Record<Coin, number> = {
  cp: 1,
  sp: 10,
  ep: 50,
  gp: 100,
  pp: 1000,
};

export function totalCp(sheet: DndSheet): number {
  const m = sheet.money ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  return (
    (m.cp || 0) +
    (m.sp || 0) * 10 +
    (m.ep || 0) * 50 +
    (m.gp || 0) * 100 +
    (m.pp || 0) * 1000
  );
}

/**
 * Keep gold (gp total) and money purse aligned.
 * Legacy sheets may only have gold:N with empty money — seed
 * money.gp so vendor spendCoins can use the purse.
 */
export function syncGoldField(sheet: DndSheet): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  const purseEmpty = totalCp(s) === 0;
  const goldN = Number(s.gold) || 0;
  if (purseEmpty && goldN > 0) {
    s.money = { cp: 0, sp: 0, ep: 0, gp: goldN, pp: 0 };
  }
  if (!s.money) {
    s.money = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  }
  s.gold = Math.floor(totalCp(s) / 100);
  return s;
}

export function formatPurse(sheet: DndSheet): string {
  const m = sheet.money ?? { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const parts: string[] = [];
  if (m.pp) parts.push(`${m.pp} pp`);
  if (m.gp) parts.push(`${m.gp} gp`);
  if (m.ep) parts.push(`${m.ep} ep`);
  if (m.sp) parts.push(`${m.sp} sp`);
  if (m.cp) parts.push(`${m.cp} cp`);
  if (!parts.length) parts.push("0 gp");
  return parts.join(", ");
}

export function addCoins(
  sheet: DndSheet,
  amount: number,
  coin: Coin,
): DndSheet {
  const s = structuredClone(sheet) as DndSheet;
  s.money = {
    cp: s.money?.cp ?? 0,
    sp: s.money?.sp ?? 0,
    ep: s.money?.ep ?? 0,
    gp: s.money?.gp ?? 0,
    pp: s.money?.pp ?? 0,
  };
  s.money[coin] = Math.max(0, (s.money[coin] || 0) + amount);
  return syncGoldField(s);
}

/**
 * Spend amount of coin type, converting from higher denominations
 * when needed. Returns null if cannot afford.
 */
export function spendCoins(
  sheet: DndSheet,
  amount: number,
  coin: Coin,
): DndSheet | null {
  if (amount <= 0) return sheet;
  const needCp = amount * COIN_TO_CP[coin];
  if (totalCp(sheet) < needCp) return null;

  let s = structuredClone(sheet) as DndSheet;
  s.money = {
    cp: s.money?.cp ?? 0,
    sp: s.money?.sp ?? 0,
    ep: s.money?.ep ?? 0,
    gp: s.money?.gp ?? 0,
    pp: s.money?.pp ?? 0,
  };

  // Convert entire purse to cp, subtract, re-denominate greedily.
  let cp = totalCp(s) - needCp;
  s.money.pp = Math.floor(cp / 1000);
  cp %= 1000;
  s.money.gp = Math.floor(cp / 100);
  cp %= 100;
  s.money.ep = Math.floor(cp / 50);
  cp %= 50;
  s.money.sp = Math.floor(cp / 10);
  s.money.cp = cp % 10;
  return syncGoldField(s);
}
