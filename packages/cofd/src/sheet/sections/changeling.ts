// Changeling: The Lost (CtL) sheet extras.
//
// Identity (Seeming/Kith/Court/Favored/Needle/Thread) and pool stats
// (Wyrd/Glamour/Clarity) already render in the header and Advantages
// sections. This section lists Contracts and active Icons.

import { divider } from "@ursamu/ursamu";
import type { SheetContext, SheetSection } from "./types.ts";
import { activeIcons, readIcons } from "../../icon/index.ts";

// Render "Label: a, b, c" wrapped to <= 78 visible cols, continuation
// lines aligned under the first value. Color codes don't count.
function wrapField(label: string, items: string[], width = 78): string[] {
  const headVis = 2 + label.length + 1; // "  " + label + ":"
  const pad = headVis + 9 - label.length;
  const indent = " ".repeat(pad);
  const out: string[] = [];
  let line = `  %ch${label}:%cn` + " ".repeat(pad - headVis) + items[0];
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

export const changelingSection: SheetSection = {
  key: "changeling",
  async render(ctx: SheetContext): Promise<string[]> {
    const { sheet } = ctx;
    if ((sheet.template || "").toLowerCase().trim() !== "changeling") {
      return [];
    }

    const contracts = sheet.contracts ?? [];
    const icons = readIcons(sheet);
    const frailties = sheet.frailties ?? [];
    if (contracts.length === 0 && icons.length === 0 && frailties.length === 0) return [];

    const lines: string[] = [];
    if (contracts.length > 0) {
      lines.push(await divider("C O N T R A C T S"));
      lines.push(...wrapField("Contracts", contracts));
    }
    if (frailties.length > 0) {
      lines.push(await divider("F R A I L T I E S"));
      for (const f of frailties) {
        lines.push(`  * ${f}`);
      }
    }
    const active = activeIcons(sheet);
    if (icons.length > 0) {
      lines.push(await divider("I C O N S"));
      if (active.length === 0) {
        lines.push("  (none active — spent/recovered)");
      } else {
        const names = active.map(
          (i) =>
            `${i.name}(${i.status[0]})`,
        );
        lines.push(...wrapField("Active", names));
      }
    }
    return lines;
  },
};
