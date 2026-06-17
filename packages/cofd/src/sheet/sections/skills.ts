// Skills section: 3 columns (Mental | Physical | Social) that flow
// independently. Each column emits its skill rows and any specialty lines
// inline; the resulting line lists are zipped side-by-side so a column
// with extra specialties just runs longer than its neighbors.

import { divider } from "@ursamu/ursamu";
import {
  COFD_MENTAL_SKILLS,
  COFD_PHYSICAL_SKILLS,
  COFD_SOCIAL_SKILLS,
} from "../../dictionary/index.ts";
import { formatDottedStatLine, ljust } from "../../support/format.ts";
import type { SheetSection, SheetContext } from "./types.ts";

const TITLE_CASE = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());
const SEP = "  ";

function statCell(ctx: SheetContext, key: string, base: number, cw: number): string {
  const temp = ctx.sheet.tempStats?.[key];
  return formatDottedStatLine(TITLE_CASE(key), base, temp, cw);
}

function specialtyCell(name: string, description: string, cw: number): string {
  // Indented within the cell. Pad to cw visible chars so neighbor cells align.
  // Description is shown inline in parens, truncated if it would overflow.
  let label = name;
  if (description) {
    const indent = 4;
    const room = Math.max(0, cw - indent - name.length - 3); // " ()" = 3 chars
    if (room > 0) {
      const trimmed = description.length > room
        ? description.slice(0, Math.max(1, room - 1)) + "."
        : description;
      label = `${name} (${trimmed})`;
    }
  }
  const text = "    " + label;
  return `%cx${ljust(text, cw)}%cn`;
}

function emptyCell(cw: number): string {
  return " ".repeat(cw);
}

/** Build the per-column line list (skill row + specialties below it). */
function buildColumn(
  ctx: SheetContext,
  skills: readonly string[],
  cw: number,
): string[] {
  const sks = ctx.sheet.skills;
  const out: string[] = [];
  for (const skill of skills) {
    out.push(statCell(ctx, skill, sks[skill] || 0, cw));
    const specs = ctx.sheet.specialties?.[skill] || [];
    const descs = ctx.sheet.specialtyDescriptions?.[skill] || {};
    for (const spec of specs) out.push(specialtyCell(spec, descs[spec] || "", cw));
  }
  return out;
}

export const skillsSection: SheetSection = {
  key: "skills",
  async render(ctx: SheetContext): Promise<string[]> {
    const { width } = ctx;
    const cw = Math.floor((width - 2 - SEP.length * 2) / 3);
    const lines: string[] = [];

    lines.push(await divider("S K I L L S"));

    const colM = buildColumn(ctx, COFD_MENTAL_SKILLS,   cw);
    const colP = buildColumn(ctx, COFD_PHYSICAL_SKILLS, cw);
    const colS = buildColumn(ctx, COFD_SOCIAL_SKILLS,   cw);

    const rows = Math.max(colM.length, colP.length, colS.length);
    for (let i = 0; i < rows; i++) {
      const cM = colM[i] ?? emptyCell(cw);
      const cP = colP[i] ?? emptyCell(cw);
      const cS = colS[i] ?? emptyCell(cw);
      lines.push("  " + cM + SEP + cP + SEP + cS);
    }

    return lines;
  },
};
