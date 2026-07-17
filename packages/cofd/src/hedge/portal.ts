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
 * Can this sheet open or enter a hedgeway from the mortal side?
 * Open: closed or new season → pay Glamour.
 * Enter open/dormant same-season: free for Lost.
 */
export function checkPortalEnter(
  sheet: CofdSheet | null,
  way: Hedgeway,
  season: string,
  fromMortal: boolean,
): PortalCheck {
  if (!sheet || !isChangelingSheet(sheet)) {
    if (way.state === "open") {
      return { ok: true, glamourCost: 0, needsOpen: false };
    }
    return {
      ok: false,
      reason: "Only the Lost can open a closed Hedgeway " +
        "(or wait for one already open).",
      glamourCost: 0,
      needsOpen: true,
    };
  }

  if (way.state === "open") {
    return { ok: true, glamourCost: 0, needsOpen: false };
  }

  if (freeOpenForLost(way, season)) {
    return { ok: true, glamourCost: 0, needsOpen: false };
  }

  // Closed or dormant wrong season: pay to open.
  if (!fromMortal && way.state === "closed") {
    // Leaving Hedge through closed side still costs Glamour
    // (portaling reverse).
  }

  const g = sheet.energyCurrent ?? 0;
  if (g < PORTAL_GLAMOUR_COST) {
    return {
      ok: false,
      reason:
        `Not enough Glamour (need ${PORTAL_GLAMOUR_COST}, have ${g}).`,
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
  return {
    lastHedgewayId: raw.lastHedgewayId,
    trailUntil: raw.trailUntil,
    priorMaskOnEnter: raw.priorMaskOnEnter === "mien" ||
        raw.priorMaskOnEnter === "mask"
      ? raw.priorMaskOnEnter
      : undefined,
    inHedge: raw.inHedge === true ? true : undefined,
  };
}

export function writeHedgeState(
  sheet: CofdSheet,
  hs: HedgeSheetState,
): CofdSheet {
  return {
    ...sheet,
    // hedgeState is optional runtime field (migrate preserves via spread)
    hedgeState: hs,
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
