// Attributes section: divider + 3 rows x 3 columns (Mental/Physical/Social).

import { divider } from "@ursamu/ursamu";
import { formatDottedStatLine } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const TITLE_CASE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

// 3 columns across the inner sheet width. With 2 spaces of left indent and
// 2 spaces between columns, each cell visible width = (width - 2 - 2*2) / 3.
const SEP = "  ";

function cell(ctx: SheetContext, key: string, base: number, cellWidth: number): string {
  const temp = ctx.sheet.tempStats?.[key];
  return formatDottedStatLine(TITLE_CASE(key), base, temp, cellWidth);
}

export const attributesSection: SheetSection = {
  key: "attributes",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, width } = ctx;
    const atts = sheet.attributes;
    const cw = Math.floor((width - 2 - SEP.length * 2) / 3);
    const lines: string[] = [];

    lines.push(await divider("A T T R I B U T E S"));

    const row = (mental: string, physical: string, social: string) =>
      "  " +
      cell(ctx, mental,   atts[mental]   || 1, cw) + SEP +
      cell(ctx, physical, atts[physical] || 1, cw) + SEP +
      cell(ctx, social,   atts[social]   || 1, cw);

    lines.push(row("intelligence", "strength",  "presence"));
    lines.push(row("wits",         "dexterity", "manipulation"));
    lines.push(row("resolve",      "stamina",   "composure"));

    return lines;
  },
};
