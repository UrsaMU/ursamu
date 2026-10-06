/** CG step screens 2-6 + shared helpers. */
import {
  CHAR_TYPES,
  SKILLS,
  TEMPLATES,
  traitDef,
} from "./data.ts";
import { templateQualitySlug } from "./template.ts";
import { attrBonusLine, grid2, traitLabel, traitName } from "./display.ts";
import {
  attrSpent,
  drawbackSpent,
  qualitySpent,
  skillSpent,
} from "./rules.ts";
import type { ICinChar } from "./types.ts";

export const W = 78;
export const DIV = "-".repeat(W);

export function cmdLine(cmd: string, desc: string): string {
  return ` ${cmd.padEnd(42)}${desc}`;
}

export function pointsLine(
  c: ICinChar,
  kind: "attr" | "skill" | "quality",
): string {
  const t = CHAR_TYPES.find((x) => x.slug === c.type);
  if (!t) {
    return " Points spent: -- / --                    Remaining: --";
  }
  const budget = kind === "attr"
    ? t.attrPoints
    : kind === "skill"
    ? t.skillPoints
    : t.qualityPoints + drawbackSpent(c);
  const spent = kind === "attr"
    ? attrSpent(c)
    : kind === "skill"
    ? skillSpent(c)
    : qualitySpent(c);
  return ` ${`Points spent: ${spent} / ${budget}`.padEnd(41)}` +
    `Remaining: ${Math.max(0, budget - spent)}`;
}

export const cap = (s: string): string =>
  s.charAt(0).toUpperCase() + s.slice(1);

export function step2(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(pointsLine(c, "attr"));
  lines.push("");
  lines.push(`%chATTRIBUTES%cn`);
  lines.push(DIV);
  const order = [
    "strength",
    "dexterity",
    "constitution",
    "intelligence",
    "perception",
    "willpower",
  ] as const;
  const pairs: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    for (const k of [order[i], order[i + 3]]) {
      const v = c.attrs[k] ?? 0;
      pairs.push([cap(k), v > 0 ? String(v) : "--"]);
    }
  }
  lines.push(...grid2(pairs));
  lines.push("");
  lines.push(
    ` Set purchased ratings here. Template bonuses apply to your` +
      ` final sheet.`,
  );
  lines.push(
    ` Every Attribute must be at least 1. Ratings above 5 require` +
      ` approval.`,
  );
  lines.push(
    ` Levels 1-5 cost 1 point each. Level 6 costs 8 points total.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/attr <Attribute>=<Rating>", ""));
  lines.push(cmdLine("Example: +cg/attr Strength=3", ""));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Concept"));
  lines.push(cmdLine("+cg/next", "Continue to Skills"));
  return lines;
}

export function stepType(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(
    ` Current: ${c.template || "Mortal (default: Human)"}`.padEnd(41) +
      `Quality cost charged from Qualities.`,
  );
  lines.push("");
  lines.push(`%chSUPERNATURAL TYPES%cn`);
  lines.push(DIV);
  for (const t of TEMPLATES) {
    const tq = templateQualitySlug(t.slug);
    const def = tq ? traitDef(tq) : undefined;
    const cost = def ? String(def.cost) : "0";
    const bonus = attrBonusLine(t.attrBonus);
    lines.push(
      ` ${t.name.padEnd(15)}${cost.padStart(4)} pts   ${bonus}`,
    );
    if (t.weaknesses) {
      lines.push(` ${"  weaknesses:".padEnd(19)}${t.weaknesses}`);
    }
  }
  lines.push("");
  lines.push(
    ` Choose one primary supernatural Template Quality. Weaknesses` +
      ` are part`,
  );
  lines.push(
    ` of the package — they grant no extra Drawback points.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/template=<Name>", "Buy the Template"));
  lines.push(cmdLine("+cg/template=mortal", "Clear (Human)"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Attributes"));
  lines.push(cmdLine("+cg/next", "Continue to Qualities"));
  return lines;
}

export function step4(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(pointsLine(c, "quality"));
  lines.push("");
  lines.push(`%chQUALITIES & POWERS%cn`);
  lines.push(DIV);
  const cells: [string, string][] = [];
  if (c.template && c.template !== "Mortal") {
    cells.push([c.template, "--"]);
  }
  for (const e of c.qualities) cells.push([traitName(e), traitLabel(e)]);
  if (cells.length === 0) lines.push(` (none)`);
  else lines.push(...grid2(cells));
  lines.push("");
  lines.push(
    ` Template cost is included. Granted benefits are added` +
      ` automatically.`,
  );
  lines.push(
    ` Use rating 1 for fixed Qualities; use the desired level for` +
      ` rated ones.`,
  );
  lines.push(
    ` Prerequisites apply. Restricted purchases require staff` +
      ` approval.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/quality <Quality>=<Rating>", ""));
  lines.push(cmdLine("+cg/remove <Quality>", ""));
  lines.push(cmdLine("+cg/catalog qualities", "Browse Qualities"));
  lines.push(cmdLine("+cg/info <Quality>", "Read cost/prereqs"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Skills"));
  lines.push(cmdLine("+cg/next", "Continue to Drawbacks"));
  return lines;
}

export function step5(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(` Drawback points: ${drawbackSpent(c)} / 10`);
  lines.push("");
  lines.push(`%chDRAWBACKS%cn`);
  lines.push(DIV);
  if (c.drawbacks.length === 0) lines.push(` (none)`);
  else {
    lines.push(
      ...grid2(
        c.drawbacks.map((e) =>
          [traitName(e), traitLabel(e)] as [string, string]
        ),
      ),
    );
  }
  lines.push(
    ` Template Weaknesses: ${c.weaknesses.trim() || "None"}`,
  );
  lines.push("");
  lines.push(` Drawbacks are optional, with a maximum of 10 points.`);
  lines.push(` Included template weaknesses grant no additional points.`);
  lines.push("");
  lines.push(cmdLine("+cg/drawback <Drawback>=<Rating>", ""));
  lines.push(cmdLine("+cg/remove <Drawback>", ""));
  lines.push(cmdLine("+cg/catalog drawbacks", "Browse Drawbacks"));
  lines.push(cmdLine("+cg/info <Drawback>", "Read value/effects"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Qualities"));
  lines.push(cmdLine("+cg/next", "Continue to Background"));
  return lines;
}
