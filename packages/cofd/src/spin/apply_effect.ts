// Apply a successful Hedgespin effect to sheet/room.

import type { CofdSheet } from "../stats/sheet.ts";
import type { SpinEffect, SpinEffectDef } from "./types.ts";
import {
  readFruitFlags,
  writeFruitFlags,
} from "../hedge/fruit_inv.ts";

export interface SpinApplyOut {
  sheet: CofdSheet;
  lines: string[];
  roomPatch?: Record<string, unknown>;
  fruitSlug?: string;
  navBonusKey?: string;
}

export function applySpinEffect(
  sheet: CofdSheet,
  effect: SpinEffectDef,
  ctx: {
    successes: number;
    veilText?: string;
    danger?: string;
    now: number;
  },
): SpinApplyOut {
  let next = sheet;
  const lines: string[] = [];
  let roomPatch: Record<string, unknown> | undefined;
  let fruitSlug: string | undefined;
  let navBonusKey: string | undefined;
  const succ = ctx.successes;
  const now = ctx.now;
  const slug = effect.slug as SpinEffect;

  switch (slug) {
    case "path": {
      navBonusKey = "spinPath";
      next = writeFruitFlags(next, [
        ...readFruitFlags(next).filter((f) => f.key !== "spinPath"),
        { key: "spinPath", until: now + 3600_000 },
      ]);
      lines.push("  Path bonus active ~1 hour.");
      break;
    }
    case "shelter":
      roomPatch = { danger: "trod", trodRating: 1 };
      lines.push("  Room leans safer (trod-like).");
      break;
    case "barrier":
      lines.push("  A barrier of thorns rises (RP / ST).");
      break;
    case "veil": {
      const text = (ctx.veilText ?? "An ordinary glade.").slice(0, 200);
      roomPatch = { maskFlavor: text };
      lines.push(`  Mortal veil: ${text.slice(0, 60)}`);
      break;
    }
    case "fruit":
      fruitSlug = "common-fruit";
      lines.push("  A common goblin fruit ripens.");
      break;
    case "trap":
      lines.push("  Snare set (ST: Ambushed on a foe).");
      break;
    case "equipment": {
      const bonus = Math.min(5, succ);
      next = writeFruitFlags(next, [
        ...readFruitFlags(next).filter((f) => f.key !== "spinEquip"),
        { key: "spinEquip", until: now + 3600_000 },
      ]);
      next = {
        ...next,
        tempStats: { ...(next.tempStats ?? {}), _spinEquip: bonus },
      };
      lines.push(`  Next roll equipment +${bonus} (spinEquip).`);
      break;
    }
    case "armor":
      lines.push(
        `  Armor ${Math.min(5, succ)}/${Math.min(5, succ)} one turn (ST).`,
      );
      break;
    case "weapon":
      lines.push(`  Weapon Availability ≤ ${succ} (ST stats).`);
      break;
    case "guide":
      lines.push("  Direction to that type of place known.");
      break;
    case "tilt":
      lines.push("  Personal Tilt imposed (ST choose).");
      break;
    case "edge":
      next = writeFruitFlags(next, [
        ...readFruitFlags(next).filter((f) => f.key !== "spinEdge"),
        { key: "spinEdge", until: now + 3600_000 },
      ]);
      lines.push("  Edge on next nav turn (spinEdge).");
      break;
    case "terrain":
      lines.push("  Terrain feature shaped (RP / ST).");
      break;
    case "goblin-fruit":
      fruitSlug = "common-fruit";
      lines.push("  Paradigm: goblin fruit crystallizes.");
      break;
    case "env-tilt":
      lines.push("  Environmental Tilt (ST apply).");
      break;
    case "scenery": {
      const text = (ctx.veilText ?? "Rewritten glade.").slice(0, 200);
      roomPatch = { flavor: text, maskFlavor: text };
      lines.push(`  Scenery: ${text.slice(0, 60)}`);
      break;
    }
    case "danger-step": {
      const d = (ctx.danger ?? "hedge").toLowerCase();
      const nextD = d === "thorns"
        ? "hedge"
        : d === "hedge"
        ? "trod"
        : "hedge";
      roomPatch = {
        danger: nextD,
        ...(nextD === "trod" ? { trodRating: 1 } : {}),
      };
      lines.push(`  Danger steps toward ${nextD}.`);
      break;
    }
  }

  return { sheet: next, lines, roomPatch, fruitSlug, navBonusKey };
}
