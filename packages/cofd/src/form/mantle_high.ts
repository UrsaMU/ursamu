// Mantle •••+ effects (CtL p.117–118) — pure helpers.

import type { CofdSheet } from "../stats/sheet.ts";
import { ownMantle } from "./mantle.ts";
import {
  addCondition,
  removeCondition,
  hasCondition,
} from "../subsystems/conditions.ts";
import {
  openDebts,
  writeDebts,
} from "../market/debt.ts";

function courtOf(sheet: CofdSheet): string {
  return (sheet.customFields?.court ?? "").toLowerCase().trim();
}

/** Summer •••: general/ballistic armor = Mantle when protecting. */
export function mantleProtectorArmor(sheet: CofdSheet): number {
  if (courtOf(sheet) !== "summer") return 0;
  const d = ownMantle(sheet);
  return d >= 3 ? d : 0;
}

/**
 * Summer •••••: mundane attacks deal aggravated when defending
 * a freehold member (caller sets defendingAlly flag).
 */
export function mantleAggravatedDefend(
  sheet: CofdSheet,
  defendingAlly: boolean,
): boolean {
  if (!defendingAlly) return false;
  if (courtOf(sheet) !== "summer") return false;
  return ownMantle(sheet) >= 5;
}

/** Autumn •••: −1 Glamour on Contracts used vs Fae/Faerie. */
export function mantleContractGlamourDiscount(
  sheet: CofdSheet,
  vsFae: boolean,
): number {
  if (!vsFae) return 0;
  if (courtOf(sheet) !== "autumn") return 0;
  return ownMantle(sheet) >= 3 ? 1 : 0;
}

/**
 * Autumn ••••: once per story reduce open Goblin Debt by Mantle dots.
 */
export function mantleWipeDebt(
  sheet: CofdSheet,
  now: number = Date.now(),
): {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  reduced: number;
  lines: string[];
} {
  if (courtOf(sheet) !== "autumn") {
    return {
      ok: false,
      reason: "Autumn Mantle •••• only.",
      reduced: 0,
      lines: [],
    };
  }
  const dots = ownMantle(sheet);
  if (dots < 4) {
    return {
      ok: false,
      reason: "Need Mantle (Autumn) ••••.",
      reduced: 0,
      lines: [],
    };
  }
  const flags = sheet.hedgeState?.fruitFlags ?? [];
  const used = flags.find((f) => f.key === "mantleDebtWipe");
  // story ≈ long; use 7 days
  if (used && used.until > now) {
    return {
      ok: false,
      reason: "Already used Mantle Debt wipe this story.",
      reduced: 0,
      lines: [],
    };
  }
  let left = dots;
  let reduced = 0;
  const open = openDebts(sheet);
  const updatedOpen = open.map((d) => {
    if (left <= 0) return d;
    const take = Math.min(left, d.amount);
    left -= take;
    reduced += take;
    const amount = d.amount - take;
    if (amount <= 0) {
      return { ...d, amount: 1, status: "paid" as const, paidAt: now };
    }
    return { ...d, amount };
  });
  const byId = new Map(updatedOpen.map((d) => [d.id, d]));
  const all = (sheet.hedgeState?.debts ?? []).map((d) => {
    const u = byId.get(String((d as { id?: string }).id ?? ""));
    return u ?? d;
  });
  let next = writeDebts(
    sheet,
    // deno-lint-ignore no-explicit-any
    all as any,
  );
  next = {
    ...next,
    hedgeState: {
      ...(next.hedgeState ?? {}),
      fruitFlags: [
        ...flags.filter((f) => f.key !== "mantleDebtWipe"),
        { key: "mantleDebtWipe", until: now + 7 * 86400_000 },
      ],
    },
  };
  return {
    ok: true,
    sheet: next,
    reduced,
    lines: [
      `Autumn Mantle ••••: Goblin Debt −${reduced}.`,
    ],
  };
}

const CLARITY_CONDS = [
  "haunted",
  "the-boneyard",
  "delusional-ctl",
  "isolated",
  "unstable",
  "waking-nightmare",
  "dream-eaten",
];

/**
 * Spring •••••: once per chapter convert a Clarity Condition
 * into Inspired and regain 1 Clarity.
 */
export function mantleConvertClarity(
  sheet: CofdSheet,
  now: number = Date.now(),
): {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  lines: string[];
} {
  if (courtOf(sheet) !== "spring") {
    return {
      ok: false,
      reason: "Spring Mantle ••••• only.",
      lines: [],
    };
  }
  if (ownMantle(sheet) < 5) {
    return {
      ok: false,
      reason: "Need Mantle (Spring) •••••.",
      lines: [],
    };
  }
  const flags = sheet.hedgeState?.fruitFlags ?? [];
  const used = flags.find((f) => f.key === "mantleClarityConvert");
  if (used && used.until > now) {
    return {
      ok: false,
      reason: "Already used this chapter.",
      lines: [],
    };
  }
  const found = CLARITY_CONDS.find((k) => hasCondition(sheet, k));
  if (!found) {
    return {
      ok: false,
      reason: "No Clarity Condition to convert.",
      lines: [],
    };
  }
  let next = removeCondition(sheet, found);
  next = addCondition(next, "inspired", "Mantle Spring •••••");
  next = {
    ...next,
    moralityValue: Math.min(10, (next.moralityValue | 0) + 1),
    hedgeState: {
      ...(next.hedgeState ?? {}),
      fruitFlags: [
        ...flags.filter((f) => f.key !== "mantleClarityConvert"),
        { key: "mantleClarityConvert", until: now + 86400_000 },
      ],
    },
  };
  return {
    ok: true,
    sheet: next,
    lines: [
      `Spring Mantle •••••: ${found} → Inspired, Clarity +1 ` +
        `(now ${next.moralityValue}).`,
    ],
  };
}

/**
 * Winter •••••: ignore wound penalties; +1 Physical per lethal/agg
 * box filled (max +5).
 */
export function mantleWinterWoundBonus(
  sheet: CofdSheet,
): { ignoreWoundPenalty: boolean; physicalBonus: number } {
  if (courtOf(sheet) !== "winter") {
    return { ignoreWoundPenalty: false, physicalBonus: 0 };
  }
  if (ownMantle(sheet) < 5) {
    return { ignoreWoundPenalty: false, physicalBonus: 0 };
  }
  const h = sheet.health;
  if (!h) {
    return { ignoreWoundPenalty: true, physicalBonus: 0 };
  }
  const filled = (h.lethal | 0) + (h.aggravated | 0);
  return {
    ignoreWoundPenalty: true,
    physicalBonus: Math.min(5, Math.max(0, filled)),
  };
}

/** Physical pool expr? */
export function isPhysicalRoll(expr: string): boolean {
  const e = expr.toLowerCase().replace(/\s+/g, "");
  return (
    e.includes("strength") ||
    e.includes("dexterity") ||
    e.includes("stamina") ||
    e.includes("brawl") ||
    e.includes("weaponry") ||
    e.includes("athletics") ||
    e.includes("firearms") ||
    e.includes("stealth") ||
    e.includes("survival") ||
    e.includes("larceny") ||
    e.includes("drive")
  );
}
