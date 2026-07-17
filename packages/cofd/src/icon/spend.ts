// Spend or recover an Icon (pure).

import type { CofdSheet } from "../stats/sheet.ts";
import { findIcon, setIconStatus } from "./store.ts";
import type { IconRecord } from "./types.ts";

export interface IconActionResult {
  ok: boolean;
  reason?: string;
  sheet?: CofdSheet;
  icon?: IconRecord;
  lines: string[];
}

/**
 * Spend a lost/held Icon for a scene benefit (CtL simplified).
 * Grants Glamour equal to min(3, Wyrd) and marks spent.
 */
export function spendIcon(
  sheet: CofdSheet,
  idOrName: string,
  note: string = "",
  now: number = Date.now(),
): IconActionResult {
  const icon = findIcon(sheet, idOrName);
  if (!icon) {
    return {
      ok: false,
      reason: `No Icon matches '${idOrName}'.`,
      lines: [],
    };
  }
  if (icon.status !== "lost" && icon.status !== "held") {
    return {
      ok: false,
      reason:
        `Icon '${icon.name}' is already ${icon.status}.`,
      lines: [],
    };
  }
  const wyrd = Math.max(1, sheet.powerStatValue || 1);
  const gain = Math.min(3, wyrd);
  const cur = sheet.energyCurrent ?? 0;
  const maxG = Math.max(10, wyrd * 10);
  const actual = Math.min(gain, Math.max(0, maxG - cur));
  let next: CofdSheet = {
    ...sheet,
    energyCurrent: cur + actual,
  };
  const r = setIconStatus(next, icon.id, "spent", {
    spentAt: now,
    spentNote: note.slice(0, 200) ||
      "Spent for a surge of self",
  });
  next = r.sheet;
  return {
    ok: true,
    sheet: next,
    icon: r.icon!,
    lines: [
      `You spend the Icon %cy${icon.name}%cn.`,
      `  Glamour +${actual} (now ${next.energyCurrent}).`,
      "  A piece of you burns bright — then is gone.",
      note
        ? `  Note: ${note.slice(0, 70)}`
        : "  (RP the memory or skill you reclaim briefly.)",
    ],
  };
}

/** Staff / plot: mark Icon recovered (restored permanently). */
export function recoverIcon(
  sheet: CofdSheet,
  idOrName: string,
  now: number = Date.now(),
): IconActionResult {
  const icon = findIcon(sheet, idOrName);
  if (!icon) {
    return {
      ok: false,
      reason: `No Icon matches '${idOrName}'.`,
      lines: [],
    };
  }
  if (icon.status === "recovered") {
    return {
      ok: false,
      reason: `Icon '${icon.name}' is already recovered.`,
      lines: [],
    };
  }
  const r = setIconStatus(sheet, icon.id, "recovered", {
    recoveredAt: now,
    heldBy: "Self",
  });
  return {
    ok: true,
    sheet: r.sheet,
    icon: r.icon!,
    lines: [
      `Icon %cy${icon.name}%cn is recovered.`,
      "  That piece of self is yours again (RP / ST).",
    ],
  };
}
