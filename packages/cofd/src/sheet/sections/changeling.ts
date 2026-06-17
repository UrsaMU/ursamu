// Changeling: The Lost (CtL) identity section.
//
// Renders Seeming, Kith, Court, Needle, Thread, Wyrd, Glamour, and Clarity.

import { divider } from "@ursamu/ursamu";
import { getStandardMaxEnergy } from "../../gamelines/templates.ts";
import type { SheetContext, SheetSection } from "./types.ts";

// Render "Label: a, b, c" wrapped to <= 78 visible cols, continuation lines
// aligned under the first value. Color codes don't count toward width.
function wrapField(label: string, items: string[], width = 78): string[] {
  const headVis = 2 + label.length + 1; // "  " + label + ":"
  const pad = headVis + 9 - label.length;
  const indent = " ".repeat(pad);
  const out: string[] = [];
  let line = `  %ch${label}:%cn` + " ".repeat(pad - headVis) + items[0];
  let vis = pad + items[0].length;
  for (let i = 1; i < items.length; i++) {
    const add = ", " + items[i];
    if (vis + add.length > width) { out.push(line + ","); line = indent + items[i]; vis = indent.length + items[i].length; }
    else { line += add; vis += add.length; }
  }
  out.push(line);
  return out;
}

export const changelingSection: SheetSection = {
  key: "changeling",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    if ((sheet.template || "").toLowerCase().trim() !== "changeling") {
      return [];
    }

    const seeming = sheet.customFields?.seeming || "(unset)";
    const kith = sheet.customFields?.kith || "(unset)";
    const court = sheet.customFields?.court || "(unset)";
    const favored = sheet.customFields?.favored || "(unset)";
    const needle = sheet.customFields?.needle || "(unset)";
    const thread = sheet.customFields?.thread || "(unset)";

    const wyrd = sheet.powerStatValue ?? 1;
    const maxGlamour = getStandardMaxEnergy(wyrd);
    const glamour = sheet.energyCurrent ?? 0;
    const clarity = sheet.moralityValue ?? 7;

    const lines: string[] = [];
    lines.push(await divider("C H A N G E L I N G :   T H E   L O S T"));
    lines.push(
      `  %chSeeming:%cn       ${seeming.padEnd(20)} %chKith:%cn         ${kith}`
    );
    lines.push(
      `  %chCourt:%cn         ${court.padEnd(20)} %chFavored:%cn      ${favored}`
    );
    lines.push(
      `  %chNeedle:%cn        ${needle.padEnd(20)} %chThread:%cn       ${thread}`
    );
    lines.push(
      `  %chWyrd:%cn          ${wyrd}  (Glamour max ${maxGlamour})`
    );
    lines.push(
      `  %chGlamour:%cn       ${glamour} / ${maxGlamour}`
    );
    lines.push(
      `  %chClarity:%cn       ${clarity}`
    );

    const contracts = sheet.contracts ?? [];
    if (contracts.length > 0) lines.push(...wrapField("Contracts", contracts));

    return lines;
  },
};
