// Pure Vitae spend / gain helpers for Vampire: The Requiem.

import type { CofdSheet } from "../stats/sheet.ts";
import { healDamage, type DamageType } from "../health/index.ts";
import { vitaeMaxForBp, vitaePerTurn, clampBp } from "./table.ts";

export function isVampireSheet(sheet: CofdSheet): boolean {
  return (sheet.template || "").toLowerCase().trim() === "vampire";
}

export function vitaeMax(sheet: CofdSheet): number {
  return vitaeMaxForBp(sheet.powerStatValue || 1);
}

export function vitaeCurrent(sheet: CofdSheet): number {
  return Math.max(0, sheet.energyCurrent | 0);
}

export interface VitaeResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  spent?: number;
  gained?: number;
  lines: string[];
}

function clone(sheet: CofdSheet): CofdSheet {
  return {
    ...sheet,
    health: sheet.health
      ? { ...sheet.health }
      : { bashing: 0, lethal: 0, aggravated: 0 },
    advantages: { ...sheet.advantages },
    tempStats: { ...(sheet.tempStats ?? {}) },
    conditions: [...(sheet.conditions ?? [])],
  };
}

/** Spend N Vitae (respects pool; optional per-turn cap check). */
export function spendVitae(
  sheet: CofdSheet,
  amount: number,
  opts: { ignorePerTurn?: boolean; label?: string } = {},
): VitaeResult {
  if (!isVampireSheet(sheet)) {
    return {
      ok: false,
      reason: "Only vampires spend Vitae.",
      lines: [],
    };
  }
  const n = Math.max(0, Math.floor(amount));
  if (n < 1) {
    return {
      ok: false,
      reason: "Spend at least 1 Vitae.",
      lines: [],
    };
  }
  const cur = vitaeCurrent(sheet);
  if (cur < n) {
    return {
      ok: false,
      reason: `Not enough Vitae (${cur}/${vitaeMax(sheet)}).`,
      lines: [],
    };
  }
  const bp = clampBp(sheet.powerStatValue || 1);
  const cap = vitaePerTurn(bp);
  if (!opts.ignorePerTurn && n > cap) {
    return {
      ok: false,
      reason:
        `BP ${bp} allows ${cap} Vitae/turn ` +
        `(requested ${n}). Split across turns.`,
      lines: [],
    };
  }
  const next = clone(sheet);
  next.energyCurrent = cur - n;
  const label = opts.label ?? `${n} Vitae`;
  return {
    ok: true,
    sheet: next,
    spent: n,
    lines: [
      `Spent %cy${n}%cn Vitae` +
        (opts.label ? ` (${label})` : "") +
        `. Pool: %ch${next.energyCurrent}/${vitaeMax(next)}%cn.`,
    ],
  };
}

/** Gain Vitae up to max (feeding, ST grant). */
export function gainVitae(
  sheet: CofdSheet,
  amount: number,
  label = "gained",
): VitaeResult {
  if (!isVampireSheet(sheet)) {
    return {
      ok: false,
      reason: "Only vampires hold Vitae.",
      lines: [],
    };
  }
  const n = Math.max(0, Math.floor(amount));
  if (n < 1) {
    return {
      ok: false,
      reason: "Gain at least 1 Vitae.",
      lines: [],
    };
  }
  const cur = vitaeCurrent(sheet);
  const max = vitaeMax(sheet);
  const room = Math.max(0, max - cur);
  const got = Math.min(n, room);
  if (got < 1) {
    return {
      ok: false,
      reason: `Vitae already full (${cur}/${max}).`,
      lines: [],
    };
  }
  const next = clone(sheet);
  next.energyCurrent = cur + got;
  return {
    ok: true,
    sheet: next,
    gained: got,
    lines: [
      `Vitae ${label}: %cy+${got}%cn ` +
        `(${cur} → ${next.energyCurrent}/${max}).`,
    ],
  };
}

const PHYS = new Set(["strength", "dexterity", "stamina"]);

/** 1 Vitae: heal one box of bashing or lethal. */
export function healWithVitae(
  sheet: CofdSheet,
  type: "bashing" | "lethal",
): VitaeResult {
  const spend = spendVitae(sheet, 1, {
    label: `heal 1 ${type}`,
  });
  if (!spend.ok || !spend.sheet) return spend;
  const next = spend.sheet;
  const track = next.health ?? {
    bashing: 0,
    lethal: 0,
    aggravated: 0,
  };
  const before = track[type] | 0;
  if (before < 1) {
    return {
      ok: false,
      reason: `No ${type} damage to heal.`,
      lines: [],
    };
  }
  next.health = healDamage(track, 1, type as DamageType);
  return {
    ok: true,
    sheet: next,
    spent: 1,
    lines: [
      ...spend.lines,
      `Healed 1 ${type} ` +
        `(${before} → ${next.health[type]}).`,
    ],
  };
}

/** 1 Vitae: Blush of Life flag for the scene (note only). */
export function blushOfLife(sheet: CofdSheet): VitaeResult {
  const spend = spendVitae(sheet, 1, { label: "Blush of Life" });
  if (!spend.ok || !spend.sheet) return spend;
  const next = spend.sheet;
  const cf = { ...(next.customFields ?? {}) };
  cf.blush = "active";
  next.customFields = cf;
  return {
    ok: true,
    sheet: next,
    spent: 1,
    lines: [
      ...spend.lines,
      "Blush of Life: you appear human for about an hour.",
    ],
  };
}

/**
 * 1 Vitae: +2 to one Physical Attribute for the scene via tempStats.
 */
export function boostPhysical(
  sheet: CofdSheet,
  attr: string,
): VitaeResult {
  const key = attr.toLowerCase().trim();
  if (!PHYS.has(key)) {
    return {
      ok: false,
      reason: "Boost strength, dexterity, or stamina only.",
      lines: [],
    };
  }
  const spend = spendVitae(sheet, 1, {
    label: `boost ${key}`,
  });
  if (!spend.ok || !spend.sheet) return spend;
  const next = spend.sheet;
  const base = (next.attributes as Record<string, number>)[key] || 1;
  const prior = next.tempStats?.[key];
  const from = typeof prior === "number" ? prior : base;
  next.tempStats = {
    ...(next.tempStats ?? {}),
    [key]: from + 2,
  };
  return {
    ok: true,
    sheet: next,
    spent: 1,
    lines: [
      ...spend.lines,
      `${key.replace(/\b\w/g, (c) => c.toUpperCase())} ` +
        `boosted for the scene ` +
        `(effective ${from + 2}).`,
    ],
  };
}

export function vitaeStatusLine(sheet: CofdSheet): string {
  const bp = clampBp(sheet.powerStatValue || 1);
  const row = {
    max: vitaeMaxForBp(bp),
    per: vitaePerTurn(bp),
  };
  return (
    `Blood Potency ${bp}  |  Vitae ` +
    `${vitaeCurrent(sheet)}/${row.max}  |  ` +
    `${row.per}/turn`
  );
}
