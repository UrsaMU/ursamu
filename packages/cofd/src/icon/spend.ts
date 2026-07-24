// Spend or recover an Icon (pure). CtL 2e depth.

import type { CofdSheet } from "../stats/sheet.ts";
import {
  addCondition,
  hasCondition,
  removeCondition,
} from "../subsystems/conditions.ts";
import { addBeats } from "../xp/beats.ts";
import { findIcon, setIconStatus } from "./store.ts";
import type { IconRecord } from "./types.ts";

export interface IconActionResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  icon?: IconRecord;
  lines: string[];
}

/** Persistent Clarity breakpoint Conditions (CtL catalog). */
const CLARITY_COND_KEYS = [
  "haunted",
  "the-boneyard",
  "delusional-ctl",
  "isolated",
  "unstable",
  "waking-nightmare",
  "dream-eaten",
] as const;

function firstClarityCondition(
  sheet: CofdSheet,
): string | null {
  for (const k of CLARITY_COND_KEYS) {
    if (hasCondition(sheet, k)) return k;
  }
  return null;
}

/**
 * Spend a lost/held Icon for a scene benefit (CtL).
 * Grants Glamour equal to min(3, Wyrd), marks spent,
 * may clear one Clarity Condition, skill Icons buff.
 */
export function spendIcon(
  sheet: CofdSheet,
  idOrName: string,
  note: string = "",
  now: number = Date.now(),
): IconActionResult {
  const icon = findIcon(sheet, idOrName);
  if (!icon) {
    return {
      ok: false,
      reason: `No Icon matches '${idOrName}'.`,
      lines: [],
    };
  }
  if (icon.status !== "lost" && icon.status !== "held") {
    return {
      ok: false,
      reason:
        `Icon '${icon.name}' is already ${icon.status}.`,
      lines: [],
    };
  }
  const wyrd = Math.max(1, sheet.powerStatValue || 1);
  const gain = Math.min(3, wyrd);
  const cur = sheet.energyCurrent ?? 0;
  const maxG = Math.max(10, wyrd * 10);
  const actual = Math.min(gain, Math.max(0, maxG - cur));
  let next: CofdSheet = {
    ...sheet,
    energyCurrent: cur + actual,
  };
  const r = setIconStatus(next, icon.id, "spent", {
    spentAt: now,
    spentNote: note.slice(0, 200) ||
      "Spent for a surge of self",
  });
  next = r.sheet;
  const lines = [
    `You spend the Icon %cy${icon.name}%cn.`,
    `  Glamour +${actual} (now ${next.energyCurrent}).`,
    "  A piece of you burns bright — then is gone.",
  ];
  if (note) lines.push(`  Note: ${note.slice(0, 70)}`);

  // Skill Icon: temporary +1 to named skill for ~1 hour.
  if (icon.kind === "skill" && icon.skillKey) {
    const sk = icon.skillKey.toLowerCase().trim();
    const base = next.skills?.[sk as keyof typeof next.skills];
    if (typeof base === "number") {
      next = {
        ...next,
        tempStats: {
          ...(next.tempStats ?? {}),
          [sk]: base + 1,
        },
      };
      lines.push(
        `  Skill surge: ${sk} +1 for the scene ` +
          `(tempStats).`,
      );
    }
  }

  // Spending an Icon may resolve one Clarity Condition.
  const cKey = firstClarityCondition(next);
  if (cKey) {
    next = removeCondition(next, cKey);
    lines.push(
      `  Clarity Condition cleared: %cy${cKey}%cn.`,
    );
  }

  return {
    ok: true,
    sheet: next,
    icon: r.icon!,
    lines,
  };
}

/** Staff / plot: mark Icon recovered (restored permanently). */
export function recoverIcon(
  sheet: CofdSheet,
  idOrName: string,
  now: number = Date.now(),
): IconActionResult {
  const icon = findIcon(sheet, idOrName);
  if (!icon) {
    return {
      ok: false,
      reason: `No Icon matches '${idOrName}'.`,
      lines: [],
    };
  }
  if (icon.status === "recovered") {
    return {
      ok: false,
      reason: `Icon '${icon.name}' is already recovered.`,
      lines: [],
    };
  }
  let next = setIconStatus(sheet, icon.id, "recovered", {
    recoveredAt: now,
    heldBy: "Self",
  }).sheet;
  // Recovering a piece of self is a Beat (goodwill / healing).
  next = addBeats(next, 1, false);
  // Optional: Informed if skill Icon returned knowledge.
  if (icon.kind === "memory" || icon.kind === "skill") {
    next = addCondition(next, "informed", icon.name);
  }
  return {
    ok: true,
    sheet: next,
    icon: findIcon(next, icon.id)!,
    lines: [
      `Icon %cy${icon.name}%cn is recovered.`,
      "  That piece of self is yours again. +1 Beat.",
      icon.kind === "memory" || icon.kind === "skill"
        ? "  Informed Condition (the returned piece)."
        : "",
    ].filter(Boolean),
  };
}
