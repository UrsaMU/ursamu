// Health section: damage track boxes, wound penalty, and status line.

import { divider } from "@ursamu/ursamu";
import { healthMax, woundPenalty } from "../../health/index.ts";
import type { HealthTrack } from "../../stats/sheet.ts";
import type { SheetContext, SheetSection } from "./types.ts";

/**
 * Render `max` boxes left-to-right. Damage fills in the order: aggravated
 * first, then lethal, then bashing -- matching CoFD 2e severity ordering on
 * the printed track. (The math layer stores counts of each type; the
 * visualization walks worst-to-least so the heaviest damage appears leftmost.)
 */
function renderBoxes(track: HealthTrack, max: number): string {
  const boxes: string[] = [];
  let agg = track.aggravated;
  let leth = track.lethal;
  let bash = track.bashing;
  for (let i = 0; i < max; i++) {
    if (agg > 0) {
      boxes.push("[*]");
      agg -= 1;
    } else if (leth > 0) {
      boxes.push("[X]");
      leth -= 1;
    } else if (bash > 0) {
      boxes.push("[/]");
      bash -= 1;
    } else {
      boxes.push("[ ]");
    }
  }
  return boxes.join("");
}

export const healthSection: SheetSection = {
  key: "health",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    const max = healthMax(sheet);
    const track: HealthTrack = sheet.health ?? {
      bashing: 0,
      lethal: 0,
      aggravated: 0,
    };

    const lines: string[] = [];
    lines.push(await divider("H E A L T H"));
    lines.push(`  %chTrack:%cn ${renderBoxes(track, max)}  (${max})`);

    const wp = woundPenalty(track, max);
    lines.push(`  %chWound Penalty:%cn ${wp}`);

    // Status line when the track is full.
    const total = track.bashing + track.lethal + track.aggravated;
    if (total >= max) {
      if (track.aggravated >= max) {
        lines.push(`  %chStatus:%cn Dead`);
      } else if (track.lethal + track.aggravated >= max) {
        lines.push(`  %chStatus:%cn Dying (bleeding out)`);
      } else {
        lines.push(`  %chStatus:%cn Unconscious`);
      }
    }
    return lines;
  },
};
