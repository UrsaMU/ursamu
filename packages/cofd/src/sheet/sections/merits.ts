// Merits section: 2-column dotted-leader listing. Instanced merits render
// with their qualifier: "Language (Spanish):......1".

import { divider } from "@ursamu/ursamu";
import { formatMeritLabel, splitMeritStorageKey } from "../../dictionary/index.ts";
import { formatDottedStatLine } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const SEP = "  ";

export const meritsSection: SheetSection = {
  key: "merits",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, width } = ctx;
    const lines: string[] = [];

    const active = Object.keys(sheet.merits || {})
      .filter(k => (sheet.merits[k] || 0) > 0)
      .sort();
    if (active.length === 0) return lines;

    lines.push(await divider("M E R I T S"));

    const cw = Math.floor((width - 2 - SEP.length) / 2);
    const labelFor = (storageKey: string) => {
      const { merit, qualifier } = splitMeritStorageKey(storageKey);
      return formatMeritLabel(merit, qualifier);
    };

    for (let i = 0; i < active.length; i += 2) {
      const k1 = active[i];
      const k2 = active[i + 1];
      const cell1 = formatDottedStatLine(
        labelFor(k1), sheet.merits[k1], sheet.tempStats?.[k1], cw,
      );
      const cell2 = k2
        ? SEP + formatDottedStatLine(
            labelFor(k2), sheet.merits[k2], sheet.tempStats?.[k2], cw,
          )
        : "";
      lines.push("  " + cell1 + cell2);
    }

    return lines;
  },
};
