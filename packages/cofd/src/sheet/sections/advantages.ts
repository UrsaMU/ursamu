// Advantages section: 3 columns of dotted-leader stat lines.
// Row 1: Willpower (cur/max) | <Morality> | Size
// Row 2: Initiative | Speed | Defense
// Row 3 (if applicable): <Power Stat> | <Energy pool current/max> | empty

import { divider } from "@ursamu/ursamu";
import { formatDottedLine, formatDottedStatLine } from "../../support/format.ts";
import { equippedArmorEntry } from "../../equipment/index.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const SEP = "  ";

function emptyCell(cw: number): string {
  return " ".repeat(cw);
}

export const advantagesSection: SheetSection = {
  key: "advantages",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet, template: tmpl, width } = ctx;
    const atts = sheet.attributes;
    const sks = sheet.skills;
    const cw = Math.floor((width - 2 - SEP.length * 2) / 3);
    const lines: string[] = [];

    lines.push(await divider("A D V A N T A G E S"));

    const wpCur = sheet.advantages.willpowerCurrent;
    const wpMax = sheet.advantages.willpowerMax;
    const initiative = (atts.dexterity || 1) + (atts.composure || 1);
    const baseSpeed = (atts.strength || 1) + (atts.dexterity || 1) + 5;
    const baseDefense = Math.min(atts.dexterity || 1, atts.wits || 1) + (sks.athletics || 0);
    // Armor: Defense floors at 0; Speed has no floor (CoFD core p.97).
    const armorInfo = ctx.u
      ? await equippedArmorEntry(ctx.u, sheet.equipment?.equippedArmor ?? null)
      : null;
    const armor = armorInfo?.entry ?? null;
    const defense = armor ? Math.max(0, baseDefense + armor.defensePenalty) : baseDefense;
    const speed = armor ? baseSpeed + armor.speedPenalty : baseSpeed;

    const row = (a: string, b: string, c: string) =>
      "  " + a + SEP + b + SEP + c;

    lines.push(row(
      formatDottedStatLine("Willpower",   wpCur, wpMax,                    cw),
      formatDottedLine(tmpl.moralityName, String(sheet.moralityValue),     cw),
      formatDottedLine("Size",            String(sheet.advantages.size),   cw),
    ));
    lines.push(row(
      formatDottedLine("Initiative", String(initiative), cw),
      formatDottedLine("Speed",      String(speed),      cw),
      formatDottedLine("Defense",    String(defense),    cw),
    ));

    if (tmpl.powerStatName !== "None" || tmpl.energyName !== "None") {
      const energyMax = tmpl.energyMaxFormula(sheet.powerStatValue);
      lines.push(row(
        formatDottedLine(tmpl.powerStatName, String(sheet.powerStatValue), cw),
        formatDottedStatLine(tmpl.energyName, sheet.energyCurrent, energyMax, cw),
        emptyCell(cw),
      ));
    }

    return lines;
  },
};
