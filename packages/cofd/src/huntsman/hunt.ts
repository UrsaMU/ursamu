// Pure hunt loop state machine (CtL Wild Hunt light).

import type { CofdSheet } from "../stats/sheet.ts";
import type {
  HunterState,
  HuntStage,
  QuarryHuntState,
} from "./types.ts";
import { defaultHuntsmanPowers } from "./powers.ts";

const STAGES: HuntStage[] = [
  "scent",
  "trail",
  "closing",
  "cornered",
];

export function stageFromProgress(p: number): HuntStage {
  if (p >= 10) return "cornered";
  if (p >= 7) return "closing";
  if (p >= 4) return "trail";
  if (p >= 1) return "scent";
  return "scent";
}

export function isHuntsmanSheet(sheet: CofdSheet): boolean {
  return (sheet.template ?? "").toLowerCase() === "huntsman";
}

export function readQuarryHunt(
  sheet: CofdSheet,
): QuarryHuntState | null {
  const h = sheet.huntState as QuarryHuntState | undefined;
  if (!h || typeof h !== "object") return null;
  if (h.active !== true) return null;
  if (!h.hunterId) return null;
  return h;
}

export function readHunterState(
  sheet: CofdSheet,
): HunterState | null {
  const h = sheet.hunterState as HunterState | undefined;
  if (!h || typeof h !== "object") return null;
  return {
    quarryId: h.quarryId,
    quarryName: h.quarryName,
    powers: Array.isArray(h.powers) ? [...h.powers] : [],
    panoply: Array.isArray(h.panoply) ? [...h.panoply] : [],
    heartBastion: h.heartBastion,
    title: h.title,
    aspiration: h.aspiration,
    stage: h.stage,
    progress: h.progress,
  };
}

export function writeQuarryHunt(
  sheet: CofdSheet,
  state: QuarryHuntState | null,
): CofdSheet {
  if (!state) return { ...sheet, huntState: undefined };
  return { ...sheet, huntState: { ...state } };
}

export function writeHunterState(
  sheet: CofdSheet,
  state: HunterState | null,
): CofdSheet {
  if (!state) return { ...sheet, hunterState: undefined };
  return { ...sheet, hunterState: { ...state } };
}

/** Start a hunt: mark quarry + hunter. */
export function startHunt(
  quarry: CofdSheet,
  hunter: CofdSheet,
  opts: {
    hunterId: string;
    hunterName: string;
    quarryId: string;
    quarryName: string;
    now?: number;
  },
): { quarry: CofdSheet; hunter: CofdSheet } {
  const qState: QuarryHuntState = {
    active: true,
    hunterId: opts.hunterId,
    hunterName: opts.hunterName,
    stage: "scent",
    progress: 1,
    startedAt: opts.now ?? Date.now(),
  };
  let hState = readHunterState(hunter) ?? {
    powers: defaultHuntsmanPowers(hunter.powerStatValue || 3),
    panoply: ["cold iron spear", "briar horn"],
  };
  hState = {
    ...hState,
    quarryId: opts.quarryId,
    quarryName: opts.quarryName,
    stage: "scent",
    progress: 1,
  };
  return {
    quarry: writeQuarryHunt(quarry, qState),
    hunter: writeHunterState(hunter, hState),
  };
}

export function endHunt(
  quarry: CofdSheet,
  hunter: CofdSheet | null,
): { quarry: CofdSheet; hunter: CofdSheet | null } {
  const q = writeQuarryHunt(quarry, null);
  if (!hunter) return { quarry: q, hunter: null };
  const hs = readHunterState(hunter);
  if (!hs) return { quarry: q, hunter };
  return {
    quarry: q,
    hunter: writeHunterState(hunter, {
      ...hs,
      quarryId: undefined,
      quarryName: undefined,
      stage: "ended",
      progress: 0,
    }),
  };
}

/**
 * Apply track successes. Mask-down adds quarry Wyrd to hunter pool
 * (caller already rolled); here we advance progress.
 * Returns updated sheets + lines.
 */
export function applyTrackResult(
  quarry: CofdSheet,
  hunter: CofdSheet,
  successes: number,
  opts: { maskDown?: boolean; now?: number } = {},
): {
  ok: boolean;
  reason?: string;
  quarry?: CofdSheet;
  hunter?: CofdSheet;
  lines: string[];
} {
  const qh = readQuarryHunt(quarry);
  if (!qh?.active) {
    return {
      ok: false,
      reason: "No active hunt on quarry.",
      lines: [],
    };
  }
  const succ = Math.max(0, Math.floor(successes));
  let progress = qh.progress + succ;
  if (opts.maskDown) progress += 1;
  progress = Math.min(10, progress);
  const stage = stageFromProgress(progress);
  const qNext = writeQuarryHunt(quarry, {
    ...qh,
    progress,
    stage,
    lastTrackAt: opts.now ?? Date.now(),
  });
  const hs = readHunterState(hunter) ?? {
    powers: [],
    panoply: [],
  };
  const hNext = writeHunterState(hunter, {
    ...hs,
    progress,
    stage,
  });
  const lines = [
    `Hunt advances: progress ${progress}/10 → %cy${stage}%cn` +
      (opts.maskDown ? " [Mask down +1]" : "") + ".",
  ];
  if (stage === "cornered") {
    lines.push(
      "  Quarry is cornered — ST: capture scene or escape chase.",
    );
  } else if (stage === "closing") {
    lines.push("  Closing in — escape or fight soon.");
  }
  return {
    ok: true,
    quarry: qNext,
    hunter: hNext,
    lines,
  };
}

/** Track pool helper: Wits+Survival+Wyrd (+quarry Wyrd if mask down). */
export function trackPoolBonus(
  hunterWyrd: number,
  quarryWyrd: number,
  maskDown: boolean,
): number {
  return maskDown ? Math.max(0, quarryWyrd) : 0;
}

export function initHuntsmanSheet(
  base: CofdSheet,
  opts: { title?: string; aspiration?: string } = {},
): CofdSheet {
  const wyrd = Math.max(1, base.powerStatValue || 3);
  let sheet: CofdSheet = {
    ...base,
    template: "huntsman",
    powerStatValue: wyrd,
    energyCurrent: Math.max(
      base.energyCurrent ?? 0,
      Math.max(10, wyrd * 5),
    ),
    contracts: [],
  };
  sheet = writeHunterState(sheet, {
    powers: defaultHuntsmanPowers(wyrd),
    panoply: ["cold iron spear", "hunter's horn"],
    title: opts.title ?? "The Verderer",
    aspiration: opts.aspiration ?? "Drag the Lost home",
  });
  return sheet;
}
