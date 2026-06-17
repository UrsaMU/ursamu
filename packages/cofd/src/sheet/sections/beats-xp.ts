// Beats & Experience section: two-pool ledger (standard + arcane).
//
// Suppressed entirely when every counter is zero, keeping fresh sheets clean.
// The Arcane line is also omitted for mortal templates, which never earn
// Arcane Experience (docs/xp-beats-spec.md s1.3).

import { divider } from "@ursamu/ursamu";
import { ljust } from "../../support/format.ts";
import { XP_COSTS } from "../../xp/costs.ts";
import type { SheetContext, SheetSection } from "./types.ts";

export const beatsXpSection: SheetSection = {
  key: "beats-xp",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    const beats = sheet.beats ?? 0;
    const xp = sheet.experience ?? 0;
    const aBeats = sheet.arcaneBeats ?? 0;
    const aXp = sheet.arcaneExperience ?? 0;

    // Suppress entirely when nothing has been earned yet.
    if (beats === 0 && xp === 0 && aBeats === 0 && aXp === 0) {
      return [];
    }

    const lines: string[] = [];
    lines.push(await divider("B E A T S   &   E X P E R I E N C E"));

    const ratio = XP_COSTS.conversion.beatsPerExperience;
    const aRatio = XP_COSTS.conversion.arcaneBeatsPerArcaneExperience;

    const beatsStr = `${beats} / ${ratio}`;
    lines.push(
      `  %chBeats:%cn ${ljust(beatsStr, 12)} %chExperiences:%cn ${xp}`,
    );

    if (sheet.template.toLowerCase().trim() !== "mortal") {
      const aBeatsStr = `${aBeats} / ${aRatio}`;
      lines.push(
        `  %chArcane Beats:%cn ${ljust(aBeatsStr, 5)} %chArcane XP:%cn ${aXp}`,
      );
    }

    return lines;
  },
};
