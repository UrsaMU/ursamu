// Mask-down: open local hedgeways and set Huntsman trail.

import type { CofdSheet } from "../stats/sheet.ts";
import type { Hedgeway } from "./types.ts";
import { applyTrailOnMien } from "./portal.ts";
import { openHedgeway, refreshHedgeway } from "./ways.ts";

export interface MaskGateResult {
  sheet: CofdSheet;
  opened: Hedgeway[];
  notes: string[];
}

/**
 * Open every hedgeway in `ways` (caller: mortalRoomId === here).
 * Sets trail on sheet. Does not persist sheet — caller does.
 */
export async function onMaskDownOpenWays(
  sheet: CofdSheet,
  ways: Hedgeway[],
  season: string,
  actorId: string,
  now: number = Date.now(),
): Promise<MaskGateResult> {
  const notes: string[] = [];
  const nextSheet = applyTrailOnMien(sheet, now);
  const opened: Hedgeway[] = [];
  const wyrd = Math.max(1, sheet.powerStatValue ?? 1);

  for (const raw of ways) {
    const way = await refreshHedgeway(raw, now);
    if (way.state === "open") {
      opened.push(way);
      continue;
    }
    const next = await openHedgeway(
      way,
      actorId,
      wyrd,
      season,
      now,
    );
    opened.push(next);
  }

  if (opened.length > 0) {
    notes.push(
      `Nearby Hedge gateways stir open (${opened.length}): ` +
        opened.map((w) => w.name).join(", ") +
        ` — open for ${wyrd} turns.`,
    );
  } else {
    notes.push(
      "You leave a trail for Huntsmen and Gentry. " +
        "No linked Hedgeways in this room.",
    );
  }
  notes.push(
    "Trail active: fae trackers auto-succeed here while " +
      "your Mask is down (and for a time after).",
  );
  return { sheet: nextSheet, opened, notes };
}
