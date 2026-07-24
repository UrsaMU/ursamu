// Pure Hedgespinning resolve (Glamour + successes + Hedge contest).

import type { CofdSheet } from "../stats/sheet.ts";
import { findSpinEffect } from "./catalog.ts";
import type { SpinResult } from "./types.ts";
import { applySpinEffect } from "./apply_effect.ts";
import { executeRoll } from "../roller/execute.ts";

export interface SpinContext {
  inHedge: boolean;
  successes: number;
  veilText?: string;
  now?: number;
  danger?: string;
  hedgeRoll?: (pool: number) => number;
}

/** Hedge dice when contesting a paradigm shift. */
export function hedgeContestPool(danger: string): number {
  const d = (danger ?? "hedge").toLowerCase();
  if (d === "trod") return 6;
  if (d === "thorns") return 10;
  return 8;
}

/**
 * Attempt to spin the Hedge. Caller rolls and supplies successes.
 * Deducts Glamour on attempt (even on fail) when cost > 0.
 */
export function resolveSpin(
  sheet: CofdSheet,
  effectKey: string,
  ctx: SpinContext,
): SpinResult {
  const effect = findSpinEffect(effectKey);
  if (!effect) {
    return {
      ok: false,
      reason: `Unknown spin effect '${effectKey}'. Try +spin/list`,
      lines: [],
    };
  }
  if (effect.needsHedge && !ctx.inHedge) {
    return {
      ok: false,
      reason: "Hedgespinning only works in the Hedge or a Hollow.",
      lines: [],
    };
  }
  const g = sheet.energyCurrent ?? 0;
  if (g < effect.glamour) {
    return {
      ok: false,
      reason: `Need ${effect.glamour} Glamour (have ${g}).`,
      lines: [],
    };
  }

  let next: CofdSheet = {
    ...sheet,
    energyCurrent: g - effect.glamour,
  };
  const lines: string[] = [
    `You spin the Hedge: %cy${effect.name}%cn ` +
      `[${effect.kind}] (−${effect.glamour} Glamour).`,
  ];
  let succ = Math.max(0, Math.floor(ctx.successes));
  const exceptional = succ >= 5;

  let hedgeContested = false;
  let hedgeSuccesses = 0;
  if (effect.kind === "paradigm") {
    hedgeContested = true;
    const pool = hedgeContestPool(ctx.danger ?? "hedge");
    hedgeSuccesses = ctx.hedgeRoll
      ? ctx.hedgeRoll(pool)
      : executeRoll(pool).successes;
    lines.push(
      `  Hedge contests (${pool}d) → ${hedgeSuccesses} ` +
        `success${hedgeSuccesses === 1 ? "" : "es"}.`,
    );
    if (hedgeSuccesses >= succ) {
      lines.push("  The Hedge rejects your paradigm shift.");
      return {
        ok: false,
        reason: "Hedge won the contest.",
        sheet: next,
        effect,
        successes: succ,
        exceptional: false,
        lines,
        hedgeContested,
        hedgeSuccesses,
      };
    }
    succ = succ - hedgeSuccesses;
    lines.push(`  Net successes after contest: ${succ}.`);
  }

  if (succ < effect.target) {
    lines.push(
      `  Fail (${succ}/${effect.target} successes). ` +
        "The thorns reject your shape.",
    );
    return {
      ok: false,
      reason: "Hedgespinning failed.",
      sheet: next,
      effect,
      successes: succ,
      exceptional: false,
      lines,
      hedgeContested,
      hedgeSuccesses,
    };
  }

  lines.push(
    `  Success (${succ}/${effect.target}` +
      (exceptional ? ", exceptional" : "") + ").",
  );
  lines.push(`  ${effect.description}`);

  const applied = applySpinEffect(next, effect, {
    successes: succ,
    veilText: ctx.veilText,
    danger: ctx.danger,
    now: ctx.now ?? Date.now(),
  });
  next = applied.sheet;
  lines.push(...applied.lines);

  if (exceptional) {
    lines.push(
      "  Exceptional: bank +1 on next spin this scene (ST).",
    );
  }

  return {
    ok: true,
    sheet: next,
    effect,
    successes: succ,
    exceptional,
    lines,
    roomPatch: applied.roomPatch,
    fruitSlug: applied.fruitSlug,
    navBonusKey: applied.navBonusKey,
    hedgeContested,
    hedgeSuccesses,
  };
}
