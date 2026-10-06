/** Chargen validation for Cinematic Unisystem. */
import {
  ATTR_HUMAN_MAX,
  DRAWBACK_CAP,
  SKILL_MAX,
  attrSpent,
  drawbackSpent,
  qualitySpent,
  skillSpent,
} from "./rules.ts";
import { charType, skillDef, traitDef } from "./data.ts";
import {
  ATTRS,
  type AttrKey,
  type ICinChar,
  type IPrereq,
} from "./types.ts";

export function checkApproved(c: ICinChar): boolean {
  return c.status === "approved";
}

export function validateStat(
  name: string,
  value: number,
): true | string {
  const key = name.toLowerCase() as AttrKey;
  if (!ATTRS.includes(key)) return `Unknown attribute: ${name}`;
  if (!Number.isInteger(value) || value < 1) {
    return "Attribute level must be an integer >= 1";
  }
  if (value > ATTR_HUMAN_MAX) {
    return `Human maximum is ${ATTR_HUMAN_MAX}`;
  }
  return true;
}

export function validateSkill(
  slug: string,
  value: number,
): true | string {
  if (!skillDef(slug)) return `Unknown skill: ${slug}`;
  if (!Number.isInteger(value) || value < 0) {
    return "Skill level must be an integer >= 0";
  }
  if (value > SKILL_MAX) return `Skill maximum is ${SKILL_MAX}`;
  return true;
}

export function validateQuality(
  slug: string,
  kind: "quality" | "drawback",
): true | string {
  const q = traitDef(slug);
  if (!q) return `Unknown trait: ${slug}`;
  const k = "kind" in q ? q.kind : "quality";
  if (k !== "either" && k !== kind) {
    return `${q.name} is not a ${kind}`;
  }
  return true;
}

/** Structural prereqs block; approval notes only warn. */
export function checkPrereqs(
  c: ICinChar,
  slug: string,
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  for (const e of c.qualities) {
    const p = traitDef(e.slug);
    if (!p || !("prereq" in p) || !p.prereq) continue;
    const miss = prereqMissing(c, p.prereq);
    const name = p.name;
    if (slug && e.slug !== slug) continue;
    for (const m of miss) errors.push(`${name} needs ${m}`);
    if (p.approval) warnings.push(`${name}: ${p.approval}`);
  }
  return { errors, warnings };
}

export function prereqMissing(c: ICinChar, p?: IPrereq): string[] {
  if (!p) return [];
  const out: string[] = [];
  const has = (s: string, lvl = 1) =>
    c.qualities.some((e) => e.slug === s && e.level >= lvl);
  if (p.any) {
    if (!p.any.some((alt) => prereqMissing(c, alt).length === 0)) {
      out.push(
        p.any.map((a) => a.q ?? a.qLevel?.[0] ?? "?").join(" or "),
      );
    }
  }
  if (p.q && !has(p.q)) out.push(`the ${p.q} quality`);
  if (p.qLevel && !has(p.qLevel[0], p.qLevel[1])) {
    out.push(`${p.qLevel[0]} ${p.qLevel[1]}+`);
  }
  if (p.attr && (c.attrs[p.attr[0]] ?? 0) < p.attr[1]) {
    out.push(`${p.attr[0]} ${p.attr[1]}+`);
  }
  if (p.skill && (c.skills[p.skill[0]] ?? 0) < p.skill[1]) {
    out.push(`${p.skill[0]} ${p.skill[1]}+`);
  }
  if (p.tier && c.type !== p.tier) out.push(`tier ${p.tier}`);
  return out;
}

/** Pool check — spent vs budget for the character's type. */
export function validatePool(c: ICinChar): true | string {
  const t = charType(c.type);
  if (!t) return "No character type set — use +chargen/type first";
  const aS = attrSpent(c);
  const qS = qualitySpent(c);
  const dS = drawbackSpent(c);
  const sS = skillSpent(c);
  if (aS > t.attrPoints) {
    return `Attribute points over budget: ${aS}/${t.attrPoints}`;
  }
  if (qS > t.qualityPoints + dS) {
    return `Qualities over budget: ${qS}/${t.qualityPoints}+${dS}`;
  }
  if (sS > t.skillPoints) {
    return `Skill points over budget: ${sS}/${t.skillPoints}`;
  }
  if (dS > DRAWBACK_CAP) {
    return `Drawbacks over cap: ${dS}/${DRAWBACK_CAP}`;
  }
  return true;
}

/** Required fields before /submit is accepted. */
export function checkRequired(c: ICinChar): string[] {
  const missing: string[] = [];
  const t = charType(c.type);
  if (!t) {
    missing.push("character type (+chargen/type)");
    return missing;
  }
  for (const a of ATTRS) {
    if ((c.attrs[a] ?? 0) < 1) {
      missing.push(`attribute ${a} (minimum 1)`);
    }
  }
  if (Object.keys(c.skills).length === 0) {
    missing.push("at least one skill");
  }
  const pool = validatePool(c);
  if (pool !== true) missing.push(pool);
  return missing;
}
