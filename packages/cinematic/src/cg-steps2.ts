/** CG step screens 6-9 (skills, powers, status, background). */
import { POWERS, SKILLS } from "./data.ts";
import { grid2, traitLabel, traitName } from "./display.ts";
import { DIV, cmdLine, pointsLine } from "./cg-steps.ts";
import type { ICinChar } from "./types.ts";

export function step6(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(pointsLine(c, "skill"));
  lines.push("");
  lines.push(`%chSKILLS%cn`);
  lines.push(DIV);
  const bought = SKILLS.filter((s) => (c.skills[s.slug] ?? 0) > 0);
  if (bought.length === 0) lines.push(` (none purchased)`);
  else {
    lines.push(
      ...grid2(bought.map((s) =>
        [s.name, String(c.skills[s.slug])] as [string, string]
      )),
    );
  }
  lines.push("");
  lines.push(
    ` Levels 1-5 cost 1 point each. Levels 6/7/8 cost 8/11/14` +
      ` points total.`,
  );
  lines.push(
    ` Only purchased Skills appear here. Set a rating to 0 to` +
      ` remove it.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/skill <Skill>=<Rating>", ""));
  lines.push(cmdLine("+cg/catalog skills", "Browse available Skills"));
  lines.push(cmdLine("+cg/info <Skill>", "Read a Skill's description"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Drawbacks"));
  lines.push(cmdLine("+cg/next", "Continue to Powers"));
  return lines;
}


export function step7(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(pointsLine(c, "quality"));
  lines.push("");
  lines.push(`%chPOWERS%cn`);
  lines.push(DIV);
  const bought = c.qualities.filter((e) =>
    POWERS.some((p) => p.slug === e.slug)
  );
  if (bought.length === 0) lines.push(` (none purchased)`);
  else {
    lines.push(
      ...grid2(bought.map((e) =>
        [traitName(e), traitLabel(e)] as [string, string]
      )),
    );
  }
  const pending = c.qualities
    .filter((e) => {
      const p = POWERS.find((x) => x.slug === e.slug);
      return p?.approval;
    });
  if (pending.length) {
    lines.push("");
    lines.push(`%cyPurchased powers flagged for staff review.%cn`);
  }
  lines.push("");
  lines.push(
    ` Powers share the Quality pool. Prerequisites are enforced at` +
      ` purchase.`,
  );
  lines.push(
    ` Staff approval notes are shown when you buy a restricted power.`,
  );
  lines.push("");
  lines.push(cmdLine("+cg/power <Name>=<Rating>", "Buy a power"));
  lines.push(cmdLine("+powers", "Browse powers catalog"));
  lines.push(cmdLine("+cg/info <Name>", "Read cost and prereqs"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Skills"));
  lines.push(cmdLine("+cg/next", "Continue to Status & Contacts"));
  return lines;
}

export function step8(c: ICinChar): string[] {
  const lines: string[] = [];
  const entries = (slug: string) =>
    c.qualities.filter((e) => e.slug === slug);
  const status = entries("status");
  const contacts = entries("contacts");
  lines.push(`%chSTATUS%cn`);
  lines.push(DIV);
  if (!status.length) lines.push(` (not set)`);
  for (const e of status) {
    lines.push(` Status(${e.note || "?"})${" ".repeat(40)}` +
      `${String(e.level)}`);
  }
  lines.push("");
  lines.push(`%chCONTACTS%cn`);
  lines.push(DIV);
  if (!contacts.length) lines.push(` (not set)`);
  for (const e of contacts) {
    lines.push(` Contacts(${e.note || "?"})${" ".repeat(38)}` +
      `${String(e.level)}`);
  }
  lines.push("");
  lines.push(
    ` Background should explain social position, supernatural` +
      ` relationships,`,
  );
  lines.push(` and unusually high ratings.`);
  lines.push("");
  lines.push(cmdLine("+cg/status=<Org>=<Rating>", "Set status"));
  lines.push(cmdLine("+cg/contact=<Group>=<Rating>", "Add a contact"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Powers"));
  lines.push(cmdLine("+cg/next", "Continue to Background"));
  return lines;
}

export function step6bg(c: ICinChar): string[] {
  const lines: string[] = [];
  lines.push(` Background: ${c.background ? "Set" : "<Not set>"}`);
  lines.push("");
  lines.push(
    ` Describe your character's history, how they came to Portland,` +
      ` and what`,
  );
  lines.push(
    ` they want now. Include important relationships and explain any` +
      ` powers`,
  );
  lines.push(` or positions that require approval.`);
  lines.push("");
  lines.push(
    ` Your background is stored separately from your character sheet.`,
  );
  lines.push("");
  lines.push(`%chCOMMANDS%cn`);
  lines.push(DIV);
  lines.push(cmdLine("+cg/background=<Text>", "Set your background"));
  lines.push(cmdLine("+cg/background", "Read your background"));
  lines.push("");
  lines.push(cmdLine("+cg/back", "Return to Status & Contacts"));
  lines.push(cmdLine("+cg/next", "Continue to Review"));
  return lines;
}

