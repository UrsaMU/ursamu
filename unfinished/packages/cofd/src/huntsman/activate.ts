// Activate a Huntsman Dread Power (pure).

import type { CofdSheet } from "../stats/sheet.ts";
import { findHuntsmanPower } from "./powers.ts";
import {
  isHuntsmanSheet,
  readHunterState,
  writeHunterState,
} from "./hunt.ts";

export interface HuntPowerResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  lines: string[];
  /** Kindred Spirits readout for caller. */
  kindred?: boolean;
}

export function activateHuntsmanPower(
  sheet: CofdSheet,
  powerKey: string,
  note?: string,
): HuntPowerResult {
  if (!isHuntsmanSheet(sheet)) {
    return {
      ok: false,
      reason: "Only Huntsman sheets use these powers.",
      lines: [],
    };
  }
  const st = readHunterState(sheet);
  if (!st) {
    return {
      ok: false,
      reason: "No hunter state on sheet.",
      lines: [],
    };
  }
  const pow = findHuntsmanPower(powerKey);
  if (!pow) {
    return {
      ok: false,
      reason: `Unknown power '${powerKey}'. +hunt/powers`,
      lines: [],
    };
  }
  const owned = new Set(st.powers.map((p) => p.toLowerCase()));
  if (!owned.has(pow.slug) && pow.slug !== "heart-of-iron") {
    return {
      ok: false,
      reason: `You do not have ${pow.name}.`,
      lines: [],
    };
  }
  const g = sheet.energyCurrent ?? 0;
  const wp = sheet.advantages?.willpowerCurrent ?? 0;
  if (g < pow.glamour) {
    return {
      ok: false,
      reason: `Need ${pow.glamour} Glamour (have ${g}).`,
      lines: [],
    };
  }
  if (wp < pow.willpower) {
    return {
      ok: false,
      reason: `Need ${pow.willpower} Willpower.`,
      lines: [],
    };
  }

  let next: CofdSheet = {
    ...sheet,
    energyCurrent: g - pow.glamour,
    advantages: {
      ...sheet.advantages,
      willpowerCurrent: wp - pow.willpower,
    },
  };
  const lines = [
    `Huntsman power: %cy${pow.name}%cn` +
      (pow.glamour || pow.willpower
        ? ` (−${pow.glamour}G` +
          (pow.willpower ? ` −${pow.willpower}WP` : "") +
          ")"
        : "") +
      ".",
    `  ${pow.description}`,
  ];
  if (note) lines.push(`  Note: ${note.slice(0, 60)}`);

  if (pow.slug === "hunters-panoply") {
    next = {
      ...next,
      tempStats: {
        ...(next.tempStats ?? {}),
        _panoply8again: 1,
      },
    };
    lines.push("  8-again on panoply actions this scene.");
  }
  if (pow.slug === "kindred-spirits") {
    lines.push(
      "  Read quarry sheet: Needle, Thread, Aspirations, Clarity " +
        "(+hunt/read if linked).",
    );
  }

  next = writeHunterState(next, st);
  return {
    ok: true,
    sheet: next,
    lines,
    kindred: pow.slug === "kindred-spirits",
  };
}
