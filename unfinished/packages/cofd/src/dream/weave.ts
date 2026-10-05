// Dreamweaving resolve (subtle + paradigm).

import type { CofdSheet } from "../stats/sheet.ts";
import type { DreamState, WeaveDef } from "./types.ts";
import { writeDreamState } from "./form.ts";
import {
  findWeaveFull,
  WEAVE_CATALOG,
  type WeaveDefFull,
} from "./weave_catalog.ts";
import {
  addCondition,
  removeCondition,
} from "../subsystems/conditions.ts";
import { addTilt } from "../subsystems/tilts.ts";

export const WEAVE_EFFECTS: readonly WeaveDef[] = WEAVE_CATALOG;

export function findWeave(key: string): WeaveDefFull | null {
  return findWeaveFull(key);
}

export interface WeaveResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  effect?: WeaveDefFull;
  lines: string[];
  easyWake?: boolean;
  /** Target sheet patches when weave affects dreamer. */
  targetHints?: string[];
}

export function resolveWeave(
  sheet: CofdSheet,
  dream: DreamState,
  effectKey: string,
  successes: number,
  roleText?: string,
  /** Optional dreamer sheet when weaving on another's Bastion. */
  dreamerSheet?: CofdSheet | null,
): WeaveResult {
  const effect = findWeaveFull(effectKey);
  if (!effect) {
    return {
      ok: false,
      reason: `Unknown weave '${effectKey}'. +dream/weaves`,
      lines: [],
    };
  }
  if (dream.weavesLeft < 1 && effect.slug !== "role") {
    return {
      ok: false,
      reason: "No weaves left this dream. Wake and rest.",
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
  let d: DreamState = { ...dream };
  let dreamer = dreamerSheet ?? null;
  const succ = Math.max(0, Math.floor(successes));
  const lines: string[] = [
    `You weave %cy${effect.name}%cn [${effect.kind}]` +
      (effect.glamour ? ` (−${effect.glamour}G)` : "") +
      ".",
  ];

  if (succ < effect.target) {
    if (effect.slug !== "role") {
      d = { ...d, weavesLeft: Math.max(0, d.weavesLeft - 1) };
    }
    next = writeDreamState(next, d);
    lines.push(
      `  Fail (${succ}/${effect.target}). The dream resists.`,
    );
    return {
      ok: false,
      reason: "Weave failed.",
      sheet: next,
      effect,
      lines,
    };
  }

  if (effect.slug !== "role") {
    d = { ...d, weavesLeft: Math.max(0, d.weavesLeft - 1) };
  }
  lines.push(
    `  Success (${succ}/${effect.target}). ${effect.description}`,
  );

  let easyWake = false;
  const targetHints: string[] = [];

  switch (effect.slug) {
    case "role": {
      const role = (roleText ?? "a fitting figure").slice(0, 80);
      d = { ...d, role };
      lines.push(`  Role set: ${role}`);
      break;
    }
    case "prop":
    case "equip": {
      const bonus = Math.min(5, succ);
      next = {
        ...next,
        tempStats: {
          ...(next.tempStats ?? {}),
          _dreamProp: bonus,
        },
      };
      lines.push(`  Equipment +${bonus} this scene.`);
      break;
    }
    case "armor":
      lines.push(
        `  Dream armor ${Math.min(5, succ)} for one turn (ST).`,
      );
      break;
    case "exit":
      easyWake = true;
      d = { ...d, fortification: 0 };
      lines.push("  Exit found — +dream/wake uncontested.");
      break;
    case "path":
      lines.push(
        "  A Road exit shimmers — +dream/travel <exit> if linked.",
      );
      break;
    case "rewrite": {
      const text = (roleText ?? "Rewritten dreamscape.").slice(0, 120);
      d = { ...d, role: d.role };
      lines.push(`  Scene: ${text.slice(0, 60)}`);
      break;
    }
    case "road-shift":
      lines.push(
        "  Temporary path opens (ST names destination node).",
      );
      break;
    case "transfer":
      lines.push("  Emotion Condition transfer — ST picks pair.");
      break;
    case "impossible":
      lines.push("  Impossible act succeeds in the dream (ST).");
      break;
    default:
      break;
  }

  // Auto condition/tilt hooks — on dreamer when in their Bastion, else self
  const onDreamer = !!(
    dreamer && d.bastionOf !== "self" && d.bastionOf !== "roads"
  );
  if (effect.applyCondition && succ >= effect.target) {
    if (onDreamer && dreamer) {
      dreamer = addCondition(
        dreamer,
        effect.applyCondition,
        "dreamweave",
      );
      targetHints.push(effect.applyCondition);
    } else {
      next = addCondition(next, effect.applyCondition, "dreamweave");
    }
    lines.push(`  Condition: %cy${effect.applyCondition}%cn`);
  }
  if (effect.applyTilt && succ >= effect.target) {
    if (onDreamer && dreamer) {
      dreamer = addTilt(dreamer, effect.applyTilt, "dreamweave");
    } else {
      next = addTilt(next, effect.applyTilt, "dreamweave");
    }
    lines.push(`  Tilt: %cy${effect.applyTilt}%cn`);
  }
  if (effect.clearConditions?.length) {
    if (onDreamer && dreamer) {
      for (const k of effect.clearConditions) {
        dreamer = removeCondition(dreamer, k);
      }
      lines.push(
        `  Cleared on dreamer: ${effect.clearConditions.join(", ")}`,
      );
    } else {
      for (const k of effect.clearConditions) {
        next = removeCondition(next, k);
      }
      lines.push(
        `  Cleared: ${effect.clearConditions.join(", ")}`,
      );
    }
  }

  next = writeDreamState(next, d);
  return {
    ok: true,
    sheet: next,
    effect,
    lines,
    easyWake,
    targetHints: dreamer ? targetHints : undefined,
  };
}

/** Expose dreamer sheet after weave when modified. */
export function weaveDreamerResult(
  r: WeaveResult,
  dreamer: CofdSheet | null,
  effectKey: string,
  successes: number,
): CofdSheet | null {
  if (!dreamer || !r.ok) return null;
  const effect = findWeaveFull(effectKey);
  if (!effect) return null;
  let d = dreamer;
  if (effect.applyCondition && successes >= effect.target) {
    d = addCondition(d, effect.applyCondition, "dreamweave");
  }
  if (effect.applyTilt && successes >= effect.target) {
    d = addTilt(d, effect.applyTilt, "dreamweave");
  }
  if (effect.clearConditions) {
    for (const k of effect.clearConditions) {
      d = removeCondition(d, k);
    }
  }
  return d !== dreamer ? d : null;
}
