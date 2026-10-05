// Goblin Debt on sheet.hedgeState.debts.

import type { CofdSheet } from "../stats/sheet.ts";
import type { GoblinDebt, DebtStatus } from "./types.ts";

export function readDebts(sheet: CofdSheet): GoblinDebt[] {
  const raw = sheet.hedgeState?.debts;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      const status = String(o.status ?? "open") as DebtStatus;
      return {
        id: String(o.id ?? ""),
        to: String(o.to ?? "Goblin"),
        marketId: o.marketId
          ? String(o.marketId)
          : undefined,
        marketName: o.marketName
          ? String(o.marketName)
          : undefined,
        listingSlug: o.listingSlug
          ? String(o.listingSlug)
          : undefined,
        amount: Math.max(
          1,
          Math.min(5, Math.floor(Number(o.amount) || 1)),
        ),
        note: String(o.note ?? ""),
        status: (["open", "called", "paid"] as DebtStatus[])
          .includes(status)
          ? status
          : "open",
        owedAt: Number(o.owedAt) || 0,
        calledAt: o.calledAt
          ? Number(o.calledAt)
          : undefined,
        calledNote: o.calledNote
          ? String(o.calledNote)
          : undefined,
        paidAt: o.paidAt ? Number(o.paidAt) : undefined,
      };
    })
    .filter((d) => d.id);
}

export function writeDebts(
  sheet: CofdSheet,
  debts: GoblinDebt[],
): CofdSheet {
  const base = { ...(sheet.hedgeState ?? {}) };
  return {
    ...sheet,
    hedgeState: { ...base, debts },
  };
}

export function openDebts(sheet: CofdSheet): GoblinDebt[] {
  return readDebts(sheet).filter(
    (d) => d.status === "open" || d.status === "called",
  );
}

export function totalOpenDebt(sheet: CofdSheet): number {
  return openDebts(sheet).reduce((n, d) => n + d.amount, 0);
}

export function addDebt(
  sheet: CofdSheet,
  partial: Omit<
    GoblinDebt,
    "id" | "status" | "owedAt"
  > & { id?: string },
  now: number = Date.now(),
): { sheet: CofdSheet; debt: GoblinDebt } {
  const debt: GoblinDebt = {
    id: partial.id ??
      `debt-${now}-${Math.floor(Math.random() * 1e5)}`,
    to: partial.to,
    marketId: partial.marketId,
    marketName: partial.marketName,
    listingSlug: partial.listingSlug,
    amount: Math.max(1, Math.min(5, partial.amount)),
    note: partial.note,
    status: "open",
    owedAt: now,
  };
  const next = writeDebts(sheet, [...readDebts(sheet), debt]);
  return { sheet: next, debt };
}

export function findDebt(
  sheet: CofdSheet,
  id: string,
): GoblinDebt | null {
  const q = id.toLowerCase().trim();
  return (
    readDebts(sheet).find(
      (d) =>
        d.id === id ||
        d.id.toLowerCase() === q ||
        d.id.endsWith(q),
    ) ?? null
  );
}

export function setDebtStatus(
  sheet: CofdSheet,
  id: string,
  status: DebtStatus,
  extra: Partial<GoblinDebt> = {},
): { sheet: CofdSheet; debt: GoblinDebt | null } {
  const list = readDebts(sheet);
  const idx = list.findIndex(
    (d) => d.id === id || d.id.endsWith(id),
  );
  if (idx < 0) return { sheet, debt: null };
  const debt: GoblinDebt = {
    ...list[idx],
    ...extra,
    status,
  };
  const next = [...list];
  next[idx] = debt;
  return { sheet: writeDebts(sheet, next), debt };
}
