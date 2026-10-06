/** Sheet + context formatting (78-col, MUSH codes closed with %cn).
 * Layout via engine header/divider/footer so game.layout.* config
 * and registerHeader/Divider/Footer stacks win. */
import { divider, footer, header } from "@ursamu/mush";
import { SKILLS, traitDef } from "./data.ts";
import {
  ATTR_LABELS,
  type AttrKey,
  type ICinChar,
  type IQEntry,
} from "./types.ts";
import { lifePoints } from "./rules.ts";

const W = 78;

function y(s: string): string {
  return `%cy${s}%cn`;
}

/** Engine divider section: blank, bold title, rule (config-aware). */
function sect(title: string): string[] {
  return divider(title, "-", W).split("\n");
}

export const TIERS: Record<string, string> = {
  whitehat: "Mortal",
  hero: "Hero",
  experienced: "Veteran",
};

export function attrTotal(c: ICinChar, key: AttrKey): number {
  return (c.attrs[key] ?? 0) + (c.attrBonus?.[key] ?? 0);
}

export function val(v: string, fallback: string): string {
  const t = v.trim();
  return t.length ? t : fallback;
}

/** `Name(note)` cell for a trait entry. */
export function traitName(e: IQEntry): string {
  const q = traitDef(e.slug);
  const nm = q?.name ?? e.slug;
  return e.note ? `${nm}(${e.note})` : nm;
}

export function traitLabel(e: IQEntry): string {
  const q = traitDef(e.slug);
  if (q?.perLevel || e.level > 1) return String(e.level);
  return "--";
}

/** Two-column grid (78-col): `${name.padEnd(31)}${v.padStart(5)}` per half. */
export function grid2(cells: [string, string][]): string[] {
  const lines: string[] = [];
  for (let i = 0; i < cells.length; i += 2) {
    const l = cells[i];
    const r = cells[i + 1];
    const row =
      ` ${l[0].padEnd(31)}${l[1].padStart(5)}` +
      (r ? `    ${r[0].padEnd(31)}${r[1].padStart(5)}` : "");
    lines.push(row.trimEnd());
  }
  return lines;
}

export function attrBonusLine(b?: Partial<Record<string, number>>): string {
  if (!b) return "no attribute bonus";
  const short: Record<string, string> = {
    strength: "Str",
    dexterity: "Dex",
    constitution: "Con",
    intelligence: "Int",
    perception: "Per",
    willpower: "Wil",
  };
  const parts = Object.entries(b).map(
    ([k, v]) => `+${v} ${short[k] ?? k}`,
  );
  return parts.length ? parts.join(", ") : "no attribute bonus";
}


export function formatSheet(targetName: string, c: ICinChar): string {
  const htk = c.qualities.find((e) => e.slug === "hard-to-kill")?.level ?? 0;
  const lpMax = lifePoints(c, htk);
  const lpCur = Math.max(0, lpMax - (c.damage ?? 0));
  const tier = TIERS[c.type] ?? "--";
  const lines: string[] = header(
    `Character sheet for: ${targetName}`,
    "=",
    W,
  ).split("\n");
  lines.push(
    ` Concept: ${val(c.concept, "--").slice(0, 24)}`.padEnd(41) +
      `Tier: ${tier}`,
  );
  lines.push(
    ` Template: ${val(c.template, templateOf(c)).slice(0, 40)}`,
  );
  lines.push(...sect("ATTRIBUTES"));
  const phys: AttrKey[] = ["strength", "dexterity", "constitution"];
  const mental: AttrKey[] = [
    "intelligence",
    "perception",
    "willpower",
  ];
  const attrCells: [string, string][] = [];
  for (let i = 0; i < 3; i++) {
    attrCells.push([
      ATTR_LABELS[phys[i]],
      String(attrTotal(c, phys[i])),
    ]);
    attrCells.push([
      ATTR_LABELS[mental[i]],
      String(attrTotal(c, mental[i])),
    ]);
  }
  lines.push(...grid2(attrCells));
  lines.push(...sect("SKILLS"));
  const skillCells: [string, string][] = SKILLS.map((s) => [
    s.name,
    String(c.skills[s.slug] ?? 0) === "0"
      ? "--"
      : String(c.skills[s.slug]),
  ]);
  lines.push(...grid2(skillCells));
  lines.push(...sect("QUALITIES & POWERS"));
  if (c.qualities.length === 0) lines.push(` (none)`);
  else {
    lines.push(
      ...grid2(
        c.qualities.map((e) =>
          [traitName(e), traitLabel(e)] as [string, string]
        ),
      ),
    );
  }
  lines.push(...sect("DRAWBACKS"));
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
  lines.push(` Template Weaknesses: ${val(c.weaknesses, "None")}`);
  lines.push(...sect("HEALTH & PROGRESS"));
  const left = (s: string) => s.padEnd(41).slice(0, 41);
  lines.push(
    ` ${left(`Life Points: ${lpCur} / ${lpMax}`)}` +
      `Drama Points: ${c.dramaPoints - c.dramaSpent}`,
  );
  lines.push(
    ` ${left(`Conditions: ${val(c.conditions, "None")}`.slice(0, 41))}` +
      `XP: ${c.xpEarned - c.xpSpent} avail / ${c.xpEarned} earned`,
  );
  lines.push(
    ` ${left(`Current Form: ${val(c.currentForm, "Human")}`.slice(0, 41))}` +
      `Active Effects: ${val(c.activeEffects, "None")}`,
  );
  lines.push(...sect("STAFF NOTES"));
  const approval = c.status === "approved"
    ? "Approved"
    : c.status === "submitted"
    ? "Pending"
    : c.status === "revision"
    ? "Revision"
    : "Unsubmitted";
  lines.push(
    ` ${left(`Approval: ${approval}`)}` +
      `Reviewed by: ${val(c.reviewedBy, "--")}`,
  );
  if (c.reviewNote) {
    lines.push(` Notes: ${c.reviewNote}`);
  }
  lines.push(footer("", "=", W));
  return lines.join("%r");
}

/** First supernatural template quality, else Human. */
export function templateOf(c: ICinChar): string {
  const sup = ["vampire", "werewolf", "revenant", "robot", "chosen-one"];
  const hit = c.qualities.find((e) => sup.includes(e.slug));
  return hit ? (traitDef(hit.slug)?.name ?? hit.slug) : "Human";
}

export interface IRollResult {
  roll: number;
  modifiers: number;
  total: number;
  sl: number;
  label: string;
}
