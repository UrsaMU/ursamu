// Powers section: 2-column dotted-leader list under a template-aware header
// (Disciplines / Arcana / Contracts / Renown).

import { divider } from "@ursamu/ursamu";
import { formatDottedStatLine } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const TITLE_CASE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const SEP = "  ";

export const powersSection: SheetSection = {
  key: "powers",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, template: tmpl, width } = ctx;
    const lines: string[] = [];

    const active = tmpl.validPowers.filter(p => (sheet.powers[p] || 0) > 0);
    if (active.length === 0) return lines;

    let header = "P O W E R S";
    if (sheet.template === "vampire")    header = "D I S C I P L I N E S";
    if (sheet.template === "mage")       header = "A R C A N A";
    if (sheet.template === "changeling") header = "C O N T R A C T S";
    if (sheet.template === "werewolf")   header = "R E N O W N";

    lines.push(await divider(header));

    const cw = Math.floor((width - 2 - SEP.length) / 2);
    for (let i = 0; i < active.length; i += 2) {
      const k1 = active[i];
      const k2 = active[i + 1];
      const cell1 = formatDottedStatLine(
        TITLE_CASE(k1), sheet.powers[k1], sheet.tempStats?.[k1], cw,
      );
      const cell2 = k2
        ? SEP + formatDottedStatLine(
            TITLE_CASE(k2), sheet.powers[k2], sheet.tempStats?.[k2], cw,
          )
        : "";
      lines.push("  " + cell1 + cell2);
    }

    return lines;
  },
};
