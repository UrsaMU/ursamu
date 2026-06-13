// Conditions & Aspirations section.
//
// Renders any active Conditions (and Tilts, which live in the same catalog)
// followed by the character's Aspirations. Both groups are independently
// suppressed when empty. If both lists are empty the whole section returns
// no lines so a fresh sheet stays clean.

import { divider } from "@ursamu/ursamu";
import { lookupCondition } from "../../subsystems/conditions.ts";
import { lookupTilt } from "../../subsystems/tilts.ts";
import type { SheetContext, SheetSection } from "./types.ts";

function pad(s: string, n: number): string {
  if (s.length >= n) return s.slice(0, n);
  return s + " ".repeat(n - s.length);
}

export const conditionsAspirationsSection: SheetSection = {
  key: "conditions-aspirations",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    const conditions = sheet.conditions ?? [];
    const aspirations = sheet.aspirations ?? [];
    const tilts = sheet.tilts ?? [];

    if (conditions.length === 0 && aspirations.length === 0 && tilts.length === 0) {
      return [];
    }

    const lines: string[] = [];

    if (conditions.length > 0) {
      lines.push(await divider("C O N D I T I O N S"));
      for (const c of conditions) {
        const entry = lookupCondition(c.key);
        const label = entry?.name ?? c.key;
        const desc = c.note ?? entry?.description ?? "";
        lines.push(`  ${pad(label, 18)} ${desc}`);
      }
    }

    if (tilts.length > 0) {
      lines.push(await divider("T I L T S"));
      for (const t of tilts) {
        const entry = lookupTilt(t.key);
        const label = entry?.name ?? t.key;
        const scope = entry?.scope === "environmental" ? "[E]" : "[P]";
        const desc = t.note ?? entry?.effect ?? "";
        lines.push(`  ${scope} ${pad(label, 16)} ${desc}`);
      }
    }

    if (aspirations.length > 0) {
      lines.push(await divider("A S P I R A T I O N S"));
      for (const a of aspirations) {
        const tag = a.shortTerm ? "[S]" : "[L]";
        lines.push(`  ${tag} ${a.text}`);
      }
    }

    return lines;
  },
};
