// Header section: outer header banner, name/concept, virtue/vice, custom fields.

import { header } from "@ursamu/ursamu";
import { fit } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

export const headerSection: SheetSection = {
  key: "header",
  async render(ctx: SheetContext): Promise<string[]> {
    const { playerName, sheet, template: tmpl } = ctx;
    const lines: string[] = [];

    lines.push(await header(`CHRONICLES OF DARKNESS -- ${tmpl.name.toUpperCase()}`));

    // Headers (Name, Concept, Virtue, Vice)
    lines.push(
      `  %ch%ccName:%cn    ${fit(playerName, 26)}  %ch%ccConcept:%cn ${fit(sheet.concept, 29)}`
    );
    lines.push(
      `  %ch%ccVirtue:%cn  ${fit(sheet.virtue, 26)}  %ch%ccVice:%cn    ${fit(sheet.vice, 29)}`
    );

    // Custom Fields (Clan, Covenant, Seeming, Path, etc.)
    if (tmpl.customFields.length > 0) {
      const fieldsStr = tmpl.customFields
        .map(f => {
          const title = f.replace(/\b\w/g, c => c.toUpperCase());
          const val = sheet.customFields[f] || "Unknown";
          return `%ch%cc${title}:%cn ${fit(val, 20)}`;
        })
        .join(" ");
      lines.push(`  ${fieldsStr}`);
    }

    return lines;
  },
};
