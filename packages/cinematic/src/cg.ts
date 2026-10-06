/** +cg screens 1 & 7 + dispatch. Steps 2-6 live in cg-steps.ts. */
import { divider, footer, header } from "@ursamu/mush";
import { CHAR_TYPES, TEMPLATES } from "./data.ts";
import { checkPrereqs } from "./validation.ts";
import { templateOf } from "./display.ts";
import { TIERS, val } from "./display.ts";
import {
  attrSpent,
  drawbackSpent,
  qualitySpent,
  skillSpent,
} from "./rules.ts";
import type { ICinChar } from "./types.ts";
import {
  DIV,
  W,
  cap,
  cmdLine,
  step2,
  step4,
  step5,
  stepType,
} from "./cg-steps.ts";
import {
  step6 as stepSkills,
  step7 as stepPowers,
  step8 as stepStatus,
  step6bg as stepBackground,
} from "./cg-steps2.ts";

const TIERS_ORDER = ["whitehat", "hero", "experienced"];

export const STEPS = [
  "Concept & Archetype",
  "Attributes",
  "Supernatural Type",
  "Qualities",
  "Drawbacks",
  "Skills",
  "Powers",
  "Status & Contacts",
  "Background",
  "Review & Submit",
];

export function cgProblems(c: ICinChar): string[] {
  const out: string[] = [];
  if (!c.type) out.push("Tier not set (+cg/tier).");
  for (const [k, v] of Object.entries(c.attrs)) {
    if (v < 1) out.push(`${cap(k)} below 1.`);
  }
  if (!c.background) out.push("Background not set (+cg/background=).");
  for (const e of checkPrereqs(c, "").errors) out.push(e);
  return out;
}

function tierTable(): string[] {
  const lines = [
    `%ch${"TIERS".padEnd(13)}${"Attributes".padStart(6)}` +
      `${"Qualities".padStart(13)}${"Skills".padStart(12)}` +
      `${"Drama".padStart(9)}%cn`,
  ];
  lines.push(DIV);
  for (const slug of TIERS_ORDER) {
    const t = CHAR_TYPES.find((x) => x.slug === slug);
    if (!t) continue;
    lines.push(
      ` ${TIERS[slug].padEnd(13)}${String(t.attrPoints).padStart(6)}` +
        `${String(t.qualityPoints).padStart(13)}` +
        `${String(t.skillPoints).padStart(12)}` +
        `${String(t.dramaPoints).padStart(9)}`,
    );
  }
  return lines;
}

function step1(c: ICinChar): string[] {
  const lines: string[] = [];
  const tier = TIERS[c.type] ?? "<Not set>";
  lines.push(
    ` ${`Concept: ${val(c.concept, "<Not set>").slice(0, 26)}`.padEnd(41)}` +
      `Tier: ${tier}`,
  );
  lines.push(` Template: ${val(c.template, templateOf(c)).slice(0, 40)}`);
  lines.push("");
  lines.push(...tierTable());
  lines.push(` Veteran requires approval. Maximum Drawback points: 10.`);
  lines.push("");
  lines.push(` TEMPLATES: ${TEMPLATES.map((t) => t.name).join(", ")}`);
  lines.push(
    ` Take Vampire or Lycanthrope as a Quality; the template follows.` +
     
      ` Witches and` +
      
      ` psychics` +
      
      ` buy powers later.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/concept=<Short concept>", ""));
  lines.push(cmdLine("+cg/tier=<Mortal / Hero / Veteran>", ""));
  lines.push(cmdLine("+cg/next", "Continue to Attributes"));
  return lines;
}

function review(c: ICinChar): string[] {
  const t = CHAR_TYPES.find((x) => x.slug === c.type);
  const lines: string[] = [];
  lines.push(
    ` ${`Tier: ${TIERS[c.type] ?? "<Not set>"}`.padEnd(41)}` +
      `Template: ${val(c.template, templateOf(c))}`,
  );
  lines.push(` Background: ${c.background ? "Set" : "Not set"}`);
  lines.push("");
  lines.push(`%ch${"POINTS".padEnd(38)}Spent    Available%cn`);
  lines.push(DIV);
  const row = (label: string, spent: number, avail: string) =>
    lines.push(
      ` ${label.padEnd(38)}${String(spent).padStart(5)}` +
        `${avail.padStart(12)}`,
    );
  row("Attributes", attrSpent(c), t ? String(t.attrPoints) : "--");
  row("Skills", skillSpent(c), t ? String(t.skillPoints) : "--");
  row("Qualities", qualitySpent(c), t ? String(t.qualityPoints) : "--");
  row("Drawbacks", drawbackSpent(c), "10");
  lines.push("");
  lines.push(`%chREVIEW%cn`);
  lines.push(DIV);
  const problems = cgProblems(c);
  if (problems.length === 0) lines.push(` Ready to submit.`);
  else for (const p of problems) lines.push(` - %cr${p}%cn`);
  for (const w of checkPrereqs(c, "").warnings) {
    lines.push(` Staff review: ${w}`);
  }
  lines.push(
    ` Resolve errors before submitting. Staff will review flagged` +
      ` purchases.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/sheet", "Preview your character sheet"));
  lines.push(cmdLine("+cg/submit", "Submit for staff approval"));
  lines.push(cmdLine("+cg/back", "Return to Background"));
  return lines;
}

export function formatCg(targetName: string, c: ICinChar): string {
  const lines: string[] = header(
    `Character generation for: ${targetName}`,
    "=",
    W,
  ).split("\n");
  const step = Math.min(Math.max(c.step || 1, 1), 10);
  lines.push(`%chSTEP ${step}: ${STEPS[step - 1].toUpperCase()}%cn`);
  lines.push("");
  switch (step) {
    case 1:
      lines.push(...step1(c));
      break;
    case 2:
      lines.push(...step2(c));
      break;
    case 3:
      lines.push(...stepType(c));
      break;
    case 4:
      lines.push(...step4(c));
      break;
    case 5:
      lines.push(...step5(c));
      break;
    case 6:
      lines.push(...stepSkills(c));
      break;
    case 7:
      lines.push(...stepPowers(c));
      break;
    case 8:
      lines.push(...stepStatus(c));
      break;
    case 9:
      lines.push(...stepBackground(c));
      break;
    default:
      lines.push(...review(c));
      break;
  }
  lines.push(footer("", "=", W));
  return lines.join("%r");
}
