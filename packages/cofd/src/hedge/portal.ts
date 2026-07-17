// Pure portaling cost / eligibility (CtL 2e).

import type { CofdSheet } from "../stats/sheet.ts";
import { isChangelingSheet } from "../form/mask.ts";
import type { HedgeSheetState, Hedgeway } from "./types.ts";
import { PORTAL_GLAMOUR_COST } from "./types.ts";
import { freeOpenForLost } from "./ways.ts";

export interface PortalCheck {
  ok: boolean;
  reason?: string;
  glamourCost: number;
  needsOpen: boolean;
}

/**
 * Can this sheet open or enter a hedgeway?
 * - Already open: free for anyone.
 * - Correct key phrase: free for anyone (opens if closed).
 * - Lost + free season stamp: free.
 * - Lost otherwise: 1 Glamour to open.
 * - Mortal/non-Lost closed: need key or open gate.
 */
export function checkPortalEnter(
  sheet: CofdSheet | null,
  way: Hedgeway,
  season: string,
  fromMortal: boolean,
  spokenKey?: string,
): PortalCheck {
  if (way.state === "open") {
    return { ok: true, glamourCost: 0, needsOpen: false };
  }

  const keyOk = Boolean(
    spokenKey &&
      spokenKey.trim() &&
      way.keyPhrase &&
      way.keyPhrase.trim() &&
      spokenKey.trim().toLowerCase().replace(/\s+/g, " ") ===
        way.keyPhrase.trim().toLowerCase().replace(/\s+/g, " "),
  );
  if (keyOk) {
    return { ok: true, glamourCost: 0, needsOpen: true };
  }

  if (!sheet || !isChangelingSheet(sheet)) {
    const hint = way.keyPhrase
      ? " Speak the key: +hedge/open <gate>=phrase"
      : "";
    return {
      ok: false,
      reason: "Only the Lost can open a closed Hedgeway" +
        " (or use a key / wait until open)." + hint,
      glamourCost: 0,
      needsOpen: true,
    };
  }

  if (freeOpenForLost(way, season)) {
    return { ok: true, glamourCost: 0, needsOpen: false };
  }

  // Closed or dormant wrong season: pay to open.
  void fromMortal;

  const g = sheet.energyCurrent ?? 0;
  if (g < PORTAL_GLAMOUR_COST) {
    return {
      ok: false,
      reason:
        `Not enough Glamour (need ${PORTAL_GLAMOUR_COST}, have ${g}).` +
        (way.keyPhrase
          ? " Or: +hedge/open <gate>=keyphrase"
          : ""),
      glamourCost: PORTAL_GLAMOUR_COST,
      needsOpen: true,
    };
  }
  return {
    ok: true,
    glamourCost: PORTAL_GLAMOUR_COST,
    needsOpen: true,
  };
}

export function readHedgeState(
  sheet: CofdSheet,
): HedgeSheetState {
  const raw = (sheet as CofdSheet & {
    hedgeState?: HedgeSheetState;
  }).hedgeState;
  if (!raw || typeof raw !== "object") return {};
  // Preserve full hedgeState (nav, fruit, debts, homeHollow).
  return { ...raw };
}

export function writeHedgeState(
  sheet: CofdSheet,
  hs: HedgeSheetState,
): CofdSheet {
  const prev = readHedgeState(sheet);
  return {
    ...sheet,
    hedgeState: { ...prev, ...hs },
  } as CofdSheet;
}

export function trailActive(
  sheet: CofdSheet,
  now: number = Date.now(),
): boolean {
  const hs = readHedgeState(sheet);
  return typeof hs.trailUntil === "number" && hs.trailUntil > now;
}

/** Scene-length trail after Mask down (~1 hour wall). */
export const TRAIL_MS = 60 * 60 * 1000;

export function applyTrailOnMien(
  sheet: CofdSheet,
  now: number = Date.now(),
): CofdSheet {
  const hs = readHedgeState(sheet);
  return writeHedgeState(sheet, {
    ...hs,
    trailUntil: now + TRAIL_MS,
  });
}

export function spendGlamour(
  sheet: CofdSheet,
  cost: number,
): CofdSheet {
  if (cost <= 0) return sheet;
  return {
    ...sheet,
    energyCurrent: Math.max(0, (sheet.energyCurrent ?? 0) - cost),
  };
}
