// Werewolf: The Forsaken (WtF) identity section.
//
// Renders Auspice, Tribe, Blood, Bone, Primal Urge, Essence, and Harmony.
// (Renown dots are rendered by the shared powers section.)

import { divider } from "@ursamu/ursamu";
import { getStandardMaxEnergy } from "../../gamelines/templates.ts";
import type { SheetContext, SheetSection } from "./types.ts";

// Render "Label: a, b, c" wrapped to <= 78 visible columns, with continuation
// lines aligned under the first value. Color codes don't count toward width.
function wrapField(label: string, items: string[], width = 78): string[] {
  const head = `  %ch${label}:%cn`;
  const headVis = 2 + label.length + 1; // "  " + label + ":"
  const pad = headVis + 9 - label.length; // align values like the other rows
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

    const auspice = sheet.customFields?.auspice || "(unset)";
    const tribe = sheet.customFields?.tribe || "(unset)";
    const blood = sheet.customFields?.blood || "(unset)";
    const bone = sheet.customFields?.bone || "(unset)";

    const primalUrge = sheet.powerStatValue ?? 1;
    const maxEssence = getStandardMaxEnergy(primalUrge);
    const essence = sheet.energyCurrent ?? 0;
    const harmony = sheet.moralityValue ?? 7;

    const lines: string[] = [];
    lines.push(await divider("W E R E W O L F :   T H E   F O R S A K E N"));
    lines.push(
      `  %chAuspice:%cn       ${auspice.padEnd(20)} %chTribe:%cn        ${tribe}`
    );
    lines.push(
      `  %chBlood:%cn         ${blood.padEnd(20)} %chBone:%cn         ${bone}`
    );
    lines.push(
      `  %chPrimal Urge:%cn   ${primalUrge}  (Essence max ${maxEssence})`
    );
    lines.push(
      `  %chEssence:%cn       ${essence} / ${maxEssence}`
    );
    lines.push(
      `  %chHarmony:%cn       ${harmony}`
    );

    const gifts = sheet.gifts ?? [];
    const rites = sheet.rites ?? [];
    if (gifts.length > 0) lines.push(...wrapField("Gifts", gifts));
    if (rites.length > 0) lines.push(...wrapField("Rites", rites));

    return lines;
  },
};
