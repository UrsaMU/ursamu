// Werewolf: The Forsaken (WtF) sheet extras.
//
// Identity (Auspice/Tribe/Blood/Bone) and pool stats (Primal Urge /
// Essence / Harmony) already render in the header and Advantages
// sections. Renown dots live in the shared powers section. This
// section renders Gifts and Rites in a 2-column dotted-leader layout.

import { divider } from "@ursamu/ursamu";
import { findFacet, findRite } from "../../dictionary/index.ts";
import { formatDottedStatLine } from "../../support/format.ts";
import type { SheetContext, SheetSection } from "./types.ts";

const SEP = "  ";

export const werewolfSection: SheetSection = {
  key: "werewolf",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, width } = ctx;
    if ((sheet.template || "").toLowerCase().trim() !== "werewolf") {
      return [];
    }

    const gifts = sheet.gifts ?? [];
    const rites = sheet.rites ?? [];
    if (gifts.length === 0 && rites.length === 0) return [];

    const lines: string[] = [];
    lines.push(await divider("G I F T S   &   R I T E S"));

    const cw = Math.floor((width - 2 - SEP.length) / 2);

    // Render Gifts first
    if (gifts.length > 0) {
      const activeGifts = [...gifts].sort();
      for (let i = 0; i < activeGifts.length; i += 2) {
        const g1 = activeGifts[i];
        const g2 = activeGifts[i + 1];

        const f1 = findFacet(g1);
        const label1 = f1 ? `${f1.facet.name} (${f1.facet.renown})` : g1;
        const val1 = f1?.facet.dots ?? 1;
        const cell1 = formatDottedStatLine(label1, val1, undefined, cw);

        let cell2 = "";
        if (g2) {
          const f2 = findFacet(g2);
          const label2 = f2 ? `${f2.facet.name} (${f2.facet.renown})` : g2;
          const val2 = f2?.facet.dots ?? 1;
          cell2 = SEP + formatDottedStatLine(label2, val2, undefined, cw);
        }

        lines.push("  " + cell1 + cell2);
      }
    }

    // Render Rites second
    if (rites.length > 0) {
      if (gifts.length > 0) {
        lines.push(""); // Add an empty line separator between Gifts and Rites
      }
      const activeRites = [...rites].sort();
      for (let i = 0; i < activeRites.length; i += 2) {
        const r1 = activeRites[i];
        const r2 = activeRites[i + 1];

        const rt1 = findRite(r1);
        const label1 = rt1 ? rt1.name : r1;
        const val1 = rt1?.rank ?? 1;
        const cell1 = formatDottedStatLine(label1, val1, undefined, cw);

        let cell2 = "";
        if (r2) {
          const rt2 = findRite(r2);
          const label2 = rt2 ? rt2.name : r2;
          const val2 = rt2?.rank ?? 1;
          cell2 = SEP + formatDottedStatLine(label2, val2, undefined, cw);
        }

        lines.push("  " + cell1 + cell2);
      }
    }

    return lines;
  },
};
