// Pure Hedgespinning resolve (Glamour + successes).

import type { CofdSheet } from "../stats/sheet.ts";
import { findSpinEffect } from "./catalog.ts";
import type { SpinResult } from "./types.ts";
import {
  readFruitFlags,
  writeFruitFlags,
} from "../hedge/fruit_inv.ts";

export interface SpinContext {
  /** Room realm is hedge or hollow. */
  inHedge: boolean;
  /** Dice successes from Wits+Crafts/Occult+Wyrd roll. */
  successes: number;
  /** Optional veil prose for maskFlavor. */
  veilText?: string;
  now?: number;
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
      reason: `Unknown spin effect '${effectKey}'. ` +
        "Try +spin/list",
      lines: [],
    };
  }
  if (effect.needsHedge && !ctx.inHedge) {
    return {
      ok: false,
      reason:
        "Hedgespinning only works in the Hedge or a Hollow.",
      lines: [],
    };
  }
  const g = sheet.energyCurrent ?? 0;
  if (g < effect.glamour) {
    return {
      ok: false,
      reason:
        `Need ${effect.glamour} Glamour (have ${g}).`,
      lines: [],
    };
  }

  let next: CofdSheet = {
    ...sheet,
    energyCurrent: g - effect.glamour,
  };
  const lines: string[] = [
    `You spin the Hedge: %cy${effect.name}%cn ` +
      `(−${effect.glamour} Glamour).`,
  ];
  const succ = Math.max(0, Math.floor(ctx.successes));
  const exceptional = succ >= 5;

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
    };
  }

  lines.push(
    `  Success (${succ}/${effect.target}` +
      (exceptional ? ", exceptional" : "") + ").",
  );
  lines.push(`  ${effect.description}`);

  const now = ctx.now ?? Date.now();
  let roomPatch: Record<string, unknown> | undefined;
  let fruitSlug: string | undefined;
  let navBonusKey: string | undefined;

  switch (effect.slug) {
    case "path": {
      navBonusKey = "spinPath";
      const until = now + 3600_000;
      const flags = [
        ...readFruitFlags(next).filter(
          (f) => f.key !== "spinPath",
        ),
        { key: "spinPath", until },
      ];
      next = writeFruitFlags(next, flags);
      lines.push("  Path bonus active ~1 hour.");
      break;
    }
    case "shelter":
      roomPatch = { danger: "trod", trodRating: 1 };
      lines.push(
        "  Room leans safer (trod-like) until ST resets.",
      );
      break;
    case "barrier":
      lines.push(
        "  A barrier of thorns rises (RP / ST).",
      );
      break;
    case "veil": {
      const text = (ctx.veilText ?? "An ordinary glade.")
        .slice(0, 200);
      roomPatch = { maskFlavor: text };
      lines.push(`  Mortal veil: ${text.slice(0, 60)}`);
      break;
    }
    case "fruit":
      fruitSlug = "common-fruit";
      lines.push("  A common goblin fruit ripens for you.");
      break;
    case "trap":
      lines.push(
        "  Snare set. ST may apply Ambushed to a foe.",
      );
      break;
  }

  if (exceptional) {
    lines.push(
      "  Exceptional: the Hedge remembers your craft " +
        "(+1 on next spin this scene, ST).",
    );
  }

  return {
    ok: true,
    sheet: next,
    effect,
    successes: succ,
    exceptional,
    lines,
    roomPatch,
    fruitSlug,
    navBonusKey,
  };
}
