// Header section: outer header banner, name/concept, virtue/vice,
// and template custom fields (Seeming/Kith/..., Auspice/Tribe/...).
//
// Geometry (visible cols, color codes ignored):
//   "  " + leftLabelPad(9) + leftVal(26) + "  " + rightLabelPad(9)
//     + rightVal(29)
// Label text + spaces-after-colon always total 9 on each side so values
// share a common start column under Name / Concept.

import { header } from "@ursamu/ursamu";
import { fit } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const LEFT_LABEL_W = 9; // "Name:    " / "Seeming: "
const LEFT_VAL_W = 26;
const RIGHT_LABEL_W = 9; // "Concept: " / "Vice:    "
const RIGHT_VAL_W = 29;

/** "Seeming" -> "%ch%ccSeeming: %cn" padded so label+spaces == w. */
function coloredLabel(name: string, w: number): string {
  const title = name.replace(/\b\w/g, (c) => c.toUpperCase());
  const base = `${title}:`;
  const pad = Math.max(1, w - base.length); // always at least one space
  return `%ch%cc${base}%cn` + " ".repeat(pad);
}

function pairRow(
  leftKey: string,
  leftVal: string,
  rightKey?: string,
  rightVal?: string,
): string {
  const left =
    coloredLabel(leftKey, LEFT_LABEL_W) + fit(leftVal, LEFT_VAL_W);
  if (!rightKey) return "  " + left;
  const right =
    coloredLabel(rightKey, RIGHT_LABEL_W) +
    fit(rightVal ?? "", RIGHT_VAL_W);
  return "  " + left + "  " + right;
}

function customFieldRows(
  fields: string[],
  values: Record<string, string>,
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < fields.length; i += 2) {
    const lk = fields[i];
    const rk = fields[i + 1];
    lines.push(
      pairRow(
        lk,
        values[lk] || "Unknown",
        rk,
        rk ? values[rk] || "Unknown" : undefined,
      ),
    );
  }
  return lines;
}

export const headerSection: SheetSection = {
  key: "header",
  async render(ctx: SheetContext): Promise<string[]> {
    const { playerName, sheet, template: tmpl } = ctx;
    const lines: string[] = [];

    lines.push(
      await header(`Character Sheet for: ${playerName}`),
    );

    lines.push(
      pairRow("name", playerName, "concept", sheet.concept),
    );
    // Vampire: Mask/Dirge replace Virtue/Vice labels.
    const isVamp =
      (sheet.template || "").toLowerCase().trim() ===
        "vampire";
    lines.push(
      pairRow(
        isVamp ? "mask" : "virtue",
        sheet.virtue,
        isVamp ? "dirge" : "vice",
        sheet.vice,
      ),
    );

    if (tmpl.customFields.length > 0) {
      // Hide changeling mask/mien prose and optional empty bloodline
      // so the header stays compact.
      const hide = new Set(["mask", "mien", "animals"]);
      const cf = { ...(sheet.customFields ?? {}) };
      // Surface dual Touchstones with readable labels.
      if (isVamp) {
        if (!cf.touchstonemask && sheet.touchstones?.mask) {
          cf.touchstonemask = sheet.touchstones.mask;
        }
        if (!cf.touchstonedirge && sheet.touchstones?.dirge) {
          cf.touchstonedirge = sheet.touchstones.dirge;
        }
      }
      const fields = tmpl.customFields.filter((f) => {
        if (hide.has(f)) return false;
        if (
          f === "bloodline" &&
          !cf[f]
        ) {
          return false;
        }
        return true;
      });
      // Pretty labels for touchstone keys in pair rows.
      const labelMap: Record<string, string> = {
        touchstonemask: "Mask TS",
        touchstonedirge: "Dirge TS",
      };
      const displayFields = fields.map(
        (f) => labelMap[f] ?? f,
      );
      const displayVals: Record<string, string> = {};
      for (let i = 0; i < fields.length; i++) {
        displayVals[displayFields[i]] = cf[fields[i]] ||
          "Unknown";
      }
      lines.push(
        ...customFieldRows(displayFields, displayVals),
      );
    }

    return lines;
  },
};
