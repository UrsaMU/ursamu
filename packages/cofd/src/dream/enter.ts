// Enter / wake Bastions (pure).

import type { CofdSheet } from "../stats/sheet.ts";
import { addCondition } from "../subsystems/conditions.ts";
import {
  buildChangelingDreamForm,
  writeDreamState,
} from "./form.ts";
import type { DreamState } from "./types.ts";

export interface EnterResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  dream?: DreamState;
  lines: string[];
}

/** Gate of Ivory: lucid own dreams (caller supplies Res+Com successes). */
export function enterIvory(
  sheet: CofdSheet,
  successes: number,
  now: number = Date.now(),
): EnterResult {
  if (sheet.dreamState?.active) {
    return {
      ok: false,
      reason: "Already in a dream. +dream/wake first.",
      lines: [],
    };
  }
  if (successes < 1) {
    return {
      ok: false,
      reason: "Resolve+Composure failed — sleep stays murky.",
      lines: ["You drift without lucidity."],
    };
  }
  const dream = buildChangelingDreamForm(sheet, {
    gate: "ivory",
    bastionOf: "self",
    bastionName: "Your Bastion",
    fortification: 0,
    now,
  });
  const next = writeDreamState(sheet, dream);
  return {
    ok: true,
    sheet: next,
    dream,
    lines: [
      "You cross the %cyGate of Ivory%cn into your own dreams.",
      "  Dream form manifests (no Mask). +dream for status.",
      "  Weave: +dream/weave <effect>  Wake: +dream/wake",
    ],
  };
}

/** Gate of Horn: physical path from Hedge to Dreaming Roads. */
export function enterHorn(
  sheet: CofdSheet,
  opts: {
    inHedge: boolean;
    successes: number;
    bastionName?: string;
    /** Starting Roads room id if tagged. */
    roadRoomId?: string;
    roadName?: string;
    now?: number;
  },
): EnterResult {
  if (sheet.dreamState?.active) {
    return {
      ok: false,
      reason: "Already dreaming. +dream/wake first.",
      lines: [],
    };
  }
  if (!opts.inHedge) {
    return {
      ok: false,
      reason:
        "Gate of Horn is found in the Hedge (+hedge).",
      lines: [],
    };
  }
  if (opts.successes < 1) {
    return {
      ok: false,
      reason: "You fail to find a path to the Gate of Horn.",
      lines: [],
    };
  }
  const dream = buildChangelingDreamForm(sheet, {
    gate: "horn",
    bastionOf: "roads",
    bastionName: opts.roadName ?? opts.bastionName ??
      "Dreaming Roads",
    fortification: 0,
    now: opts.now,
  });
  dream.leftOwnBastion = true;
  if (opts.roadRoomId) {
    dream.roadRoomId = opts.roadRoomId;
    dream.roadPath = [opts.roadName ?? "Gate of Horn"];
  }
  const next = writeDreamState(sheet, dream);
  return {
    ok: true,
    sheet: next,
    dream,
    lines: [
      "You step the %cyGate of Horn%cn onto the Dreaming Roads.",
      opts.roadRoomId
        ? `  Node: ${opts.roadName ?? opts.roadRoomId}. ` +
          `+dream/travel <exit>`
        : "  (Tag a Roads room: staff +dream/road)",
      "  Seek Bastions: +dream/enter <dreamer> at a Bastion node.",
    ],
  };
}

/** Move along a Dreaming Roads link (updates dreamState.roadRoomId). */
export function travelRoad(
  sheet: CofdSheet,
  opts: {
    toRoomId: string;
    label: string;
    nodeName?: string;
  },
): EnterResult {
  const d = sheet.dreamState;
  if (!d?.active) {
    return {
      ok: false,
      reason: "Not on the Dreaming Roads.",
      lines: [],
    };
  }
  if (d.gate !== "horn" && d.bastionOf !== "roads") {
    return {
      ok: false,
      reason:
        "Travel the Roads from Horn entry " +
        "(or leave Bastion first).",
      lines: [],
    };
  }
  const path = [...(d.roadPath ?? []), opts.label];
  const dream: DreamState = {
    ...d,
    bastionOf: "roads",
    bastionName: opts.nodeName ?? opts.label,
    fortification: 0,
    roadRoomId: opts.toRoomId,
    roadPath: path.slice(-12),
    leftOwnBastion: true,
  };
  const next = writeDreamState(sheet, dream);
  return {
    ok: true,
    sheet: next,
    dream,
    lines: [
      `You follow %cy${opts.label}%cn on the Dreaming Roads.`,
      opts.nodeName
        ? `  Arrive: ${opts.nodeName}.`
        : `  Arrive room ${opts.toRoomId.slice(-8)}.`,
      "  +dream/travel <exit>  +dream (status)",
    ],
  };
}

/**
 * Enter another's Bastion (dream form). Contested by Fortification:
 * need successes > fortification (caller rolls Res+Com or Power+Res).
 */
export function enterOtherBastion(
  sheet: CofdSheet,
  opts: {
    ownerId: string;
    ownerName: string;
    fortification: number;
    successes: number;
    now?: number;
  },
): EnterResult {
  if (sheet.dreamState?.active && sheet.dreamState.gate === "ivory" &&
    sheet.dreamState.bastionOf === "self") {
    // leaving own bastion
  } else if (sheet.dreamState?.active &&
    sheet.dreamState.bastionOf !== "roads" &&
    sheet.dreamState.bastionOf !== "self") {
    return {
      ok: false,
      reason: "Leave this Bastion first (+dream/wake or /exit).",
      lines: [],
    };
  }
  if (opts.successes <= opts.fortification) {
    return {
      ok: false,
      reason:
        `Bastion Fortification ${opts.fortification} holds ` +
        `(rolled ${opts.successes}).`,
      lines: ["The dreamer's walls reject you."],
    };
  }
  const dream = buildChangelingDreamForm(sheet, {
    gate: sheet.dreamState?.gate ?? "ivory",
    bastionOf: opts.ownerId,
    bastionName: `${opts.ownerName}'s Bastion`,
    fortification: opts.fortification,
    now: opts.now,
  });
  dream.leftOwnBastion = true;
  const next = writeDreamState(sheet, dream);
  return {
    ok: true,
    sheet: next,
    dream,
    lines: [
      `You slip into %cy${opts.ownerName}'s Bastion%cn ` +
        `(Fort ${opts.fortification}).`,
      "  Take a role before weaving (+dream/role <text>).",
    ],
  };
}

export interface WakeResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  lines: string[];
}

/**
 * Wake from dream. If contested Bastion and not easyExit,
 * need successes > fortification. Forced/death → Lethargic.
 */
export function wakeDream(
  sheet: CofdSheet,
  opts: {
    successes?: number;
    forced?: boolean;
    easyExit?: boolean;
  } = {},
): WakeResult {
  const d = sheet.dreamState;
  if (!d?.active) {
    return {
      ok: false,
      reason: "Not currently in a dream.",
      lines: [],
    };
  }
  const fort = d.fortification ?? 0;
  const easy = opts.easyExit || fort <= 0 ||
    d.bastionOf === "self" || d.bastionOf === "roads";
  if (!easy && !opts.forced) {
    const succ = opts.successes ?? 0;
    if (succ <= fort) {
      return {
        ok: false,
        reason:
          `Cannot wake — Fortification ${fort} ` +
          `(rolled ${succ}). Weave exit or roll higher.`,
        lines: [],
      };
    }
  }

  let next = writeDreamState(sheet, null);
  const lines = [
    opts.forced
      ? "You are cast out of the dream — waking hard."
      : "You wake from the dreamscape.",
  ];
  if (opts.forced || (d.leftOwnBastion && opts.forced)) {
    next = addCondition(next, "lethargic");
    lines.push("  Condition: Lethargic (dream-death / forced).");
  }
  if (d.leftOwnBastion) {
    lines.push(
      "  No Willpower recovered from this rest " +
        "(left own Bastion).",
    );
  }
  return { ok: true, sheet: next, lines };
}
