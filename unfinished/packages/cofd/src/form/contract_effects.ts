// Apply common Conditions/Tilts mentioned in Contract effect text.
// CtL Contracts still need ST for full effects; this covers named statuses.

import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition, lookupCondition } from "../subsystems/conditions.ts";
import { addTilt, lookupTilt } from "../subsystems/tilts.ts";

/** Phrase in effect text → catalog key (condition or tilt). */
const EFFECT_MAP: readonly { re: RegExp; key: string; kind: "c" | "t" }[] = [
  { re: /\binsensate\b/i, key: "insensate", kind: "t" },
  { re: /\bblinded\b/i, key: "blinded", kind: "t" },
  { re: /\bbeaten\s*down\b/i, key: "beaten-down", kind: "t" },
  { re: /\bimmobilized\b/i, key: "immobilized", kind: "t" },
  { re: /\bblizzard\b/i, key: "blizzard", kind: "t" },
  { re: /\bheavy\s*rain\b/i, key: "heavy-rain", kind: "t" },
  { re: /\bflooded\b/i, key: "flooded", kind: "t" },
  { re: /\bextreme\s*cold\b/i, key: "extreme-cold", kind: "t" },
  { re: /\bshaken\b/i, key: "shaken", kind: "c" },
  { re: /\bspooked\b/i, key: "spooked", kind: "c" },
  { re: /\bguilty\b/i, key: "guilty", kind: "c" },
  { re: /\bparanoid\b/i, key: "paranoid", kind: "c" },
  { re: /\blost\b(?:\s+condition)?/i, key: "lost", kind: "c" },
  { re: /\bfrightened\b/i, key: "frightened", kind: "c" },
  { re: /\bwanton\b/i, key: "wanton", kind: "c" },
  { re: /\bswooned\b|\bswooning\b/i, key: "swooning", kind: "c" },
  { re: /\binspired\b/i, key: "inspired", kind: "c" },
  { re: /\bsteadfast\b/i, key: "steadfast", kind: "c" },
  { re: /\bcowed\b/i, key: "cowed", kind: "c" },
  { re: /\bcompetitive\b/i, key: "competitive", kind: "c" },
  { re: /\blethargic\b/i, key: "lethargic", kind: "c" },
  { re: /\bobsess(?:ion|ed)\b/i, key: "obsession", kind: "c" },
  // Berserk → demoralized/competitive fallback if no berserk
  { re: /\bberserk\b/i, key: "competitive", kind: "c" },
];

export interface EffectHook {
  key: string;
  kind: "condition" | "tilt";
  name: string;
}

/** Scan Contract effect text for known Conditions/Tilts. */
export function parseEffectHooks(effectText: string): EffectHook[] {
  const text = effectText ?? "";
  const out: EffectHook[] = [];
  const seen = new Set<string>();
  for (const row of EFFECT_MAP) {
    if (!row.re.test(text)) continue;
    if (seen.has(row.key)) continue;
    if (row.kind === "c") {
      const e = lookupCondition(row.key);
      if (!e) continue;
      seen.add(row.key);
      out.push({ key: row.key, kind: "condition", name: e.name });
    } else {
      const e = lookupTilt(row.key);
      if (!e) continue;
      seen.add(row.key);
      out.push({ key: row.key, kind: "tilt", name: e.name });
    }
  }
  return out;
}

export interface ApplyHooksResult {
  sheet: CofdSheet;
  applied: EffectHook[];
  lines: string[];
}

/**
 * Apply hooks to a sheet. For multi-target Contracts, caller applies
 * per target; default is the enactor only when effect is self-buff.
 */
export function applyEffectHooks(
  sheet: CofdSheet,
  effectText: string,
  opts: {
    successes: number;
    /** Prefer target for inflicted status (default true if "target"/"foe"). */
    onTarget?: boolean;
    note?: string;
  },
): ApplyHooksResult {
  if (opts.successes < 1) {
    return { sheet, applied: [], lines: [] };
  }
  const hooks = parseEffectHooks(effectText);
  if (!hooks.length) {
    return { sheet, applied: [], lines: [] };
  }

  // Self-buffs: Inspired, Steadfast, armor-like — still apply listed
  // Inflicted conditions apply when text mentions target/foe/victim.
  const text = effectText.toLowerCase();
  const isInflict = /\b(target|victim|foe|enemy|audience|mortal)\b/.test(
    text,
  );
  const selfKeys = new Set(["inspired", "steadfast", "wanton"]);

  let next = sheet;
  const applied: EffectHook[] = [];
  const lines: string[] = [];
  const note = (opts.note ?? "Contract").slice(0, 40);

  for (const h of hooks) {
    const selfOnly = selfKeys.has(h.key) && !isInflict;
    // When onTarget and inflict, skip self-only buffs on enactor sheet
    // (caller applies to target). When applying to enactor for self-buff, OK.
    if (opts.onTarget === false && isInflict && !selfOnly) {
      // Listing only for enactor — still show as suggested
      lines.push(
        `  Effect hook (apply to target): ${h.kind} %cy${h.name}%cn`,
      );
      applied.push(h);
      continue;
    }
    if (h.kind === "condition") {
      next = addCondition(next, h.key, note);
      applied.push(h);
      lines.push(`  Applied Condition: %cy${h.name}%cn`);
    } else {
      next = addTilt(next, h.key, note);
      applied.push(h);
      lines.push(`  Applied Tilt: %cy${h.name}%cn`);
    }
  }
  return { sheet: next, applied, lines };
}

/**
 * Apply hooks to target sheet for contested inflict Contracts.
 */
export function applyHooksToTarget(
  target: CofdSheet,
  effectText: string,
  successes: number,
  note?: string,
): ApplyHooksResult {
  if (successes < 1) {
    return { sheet: target, applied: [], lines: [] };
  }
  const hooks = parseEffectHooks(effectText);
  let next = target;
  const applied: EffectHook[] = [];
  const lines: string[] = [];
  const n = (note ?? "Contract").slice(0, 40);
  const selfKeys = new Set(["inspired", "steadfast"]);
  for (const h of hooks) {
    if (selfKeys.has(h.key)) continue;
    if (h.kind === "condition") {
      next = addCondition(next, h.key, n);
    } else {
      next = addTilt(next, h.key, n);
    }
    applied.push(h);
    lines.push(`  ${h.kind}: %cy${h.name}%cn`);
  }
  return { sheet: next, applied, lines };
}
