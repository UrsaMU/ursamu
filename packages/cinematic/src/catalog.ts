/** Catalog renderers for +cg/catalog / +skills / +powers / etc. */
import { POWERS, QUALITIES, SKILLS } from "./data.ts";

export function catalog(what: string): string {
  const head = `%ch${"NAME".padEnd(34)}COST  RATED  MAX%cn`;
  const rule = "-".repeat(78);
  if (what === "powers") {
    const lines = [
      `%ch${"POWER".padEnd(30)}${"COST".padStart(5)}` +
        `  LVLD  MAX  PREREQ%cn`,
      rule,
    ];
    for (const pw of POWERS) {
      lines.push(
        ` ${pw.name.padEnd(29)} ${String(pw.cost).padStart(5)}` +
          `${pw.perLevel ? "  yes" : "   no"}` +
          `${pw.max ? String(pw.max).padStart(5) : "    --"}` +
          `  ${pw.prereq ? "yes" : "--"}`,
      );
    }
    lines.push("");
    lines.push(
      ` Prerequisites are enforced at purchase; approval notes show` +
        ` on +cg/next review.`,
    );
    return lines.join("%r");
  }
  if (what === "skills") {
    const lines = [`%ch${"SKILL".padEnd(24)}LINKED ATTR%cn`, rule];
    for (const s of SKILLS) {
      lines.push(` ${s.name.padEnd(23)} ${s.attr}`);
    }
    return lines.join("%r");
  }
  const kind = what === "drawbacks" ? "drawback" : "quality";
  const lines = [head, rule];
  for (const q of QUALITIES.filter((x) => x.kind === kind || x.kind === "either")) {
    lines.push(
      ` ${q.name.padEnd(33)} ${String(q.cost).padStart(4)}` +
        `${q.perLevel ? "  yes" : "   no"}` +
        `${q.max ? String(q.max).padStart(5) : "    --"}`,
    );
  }
  return lines.join("%r");
}

