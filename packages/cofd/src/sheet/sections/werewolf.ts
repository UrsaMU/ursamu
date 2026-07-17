// Werewolf: The Forsaken (WtF) sheet extras.
//
// Identity (Auspice/Tribe/Blood/Bone) and pool stats (Primal Urge /
// Essence / Harmony) already render in the header and Advantages
// sections. Renown dots live in the shared powers section. This
// section only lists Gifts and Rites.

import { divider } from "@ursamu/ursamu";
import type { SheetContext, SheetSection } from "./types.ts";

// Render "Label: a, b, c" wrapped to <= 78 visible columns, with
// continuation lines aligned under the first value.
function wrapField(label: string, items: string[], width = 78): string[] {
  const head = `  %ch${label}:%cn`;
  const headVis = 2 + label.length + 1; // "  " + label + ":"
  const pad = headVis + 9 - label.length;
  const indent = " ".repeat(pad);
  const out: string[] = [];
  let line = head + " ".repeat(pad - headVis) + items[0];
  let vis = pad + items[0].length;
  for (let i = 1; i < items.length; i++) {
    const add = ", " + items[i];
    if (vis + add.length > width) {
      out.push(line + ",");
      line = indent + items[i];
      vis = indent.length + items[i].length;
    } else {
      line += add;
      vis += add.length;
    }
  }
  out.push(line);
  return out;
}

export const werewolfSection: SheetSection = {
  key: "werewolf",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    if ((sheet.template || "").toLowerCase().trim() !== "werewolf") {
      return [];
    }

    const gifts = sheet.gifts ?? [];
    const rites = sheet.rites ?? [];
    if (gifts.length === 0 && rites.length === 0) return [];

    const lines: string[] = [];
    lines.push(await divider("G I F T S   &   R I T E S"));
    if (gifts.length > 0) lines.push(...wrapField("Gifts", gifts));
    if (rites.length > 0) lines.push(...wrapField("Rites", rites));
    return lines;
  },
};
