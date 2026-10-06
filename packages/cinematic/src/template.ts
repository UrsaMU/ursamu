/** Template application: bonuses, weaknesses, granted packages. */
import { powerDef, templateDef, templateForQuality } from "./data.ts";
import type { AttrKey, ICinChar } from "./types.ts";

/** Template slug -> its primary Quality slug (primary template rule). */
const TEMPLATE_QUALITY: Record<string, string> = {
  vampire: "vampire",
  lycanthrope: "werewolf",
  animator: "animator",
};

export function templateQualitySlug(tslug: string): string | undefined {
  return TEMPLATE_QUALITY[tslug];
}

function removeEntry(c: ICinChar, slug: string): void {
  const i = c.qualities.findIndex((e) => e.slug === slug);
  if (i >= 0) c.qualities.splice(i, 1);
}

/** Recompute attrBonus/weaknesses/included packages for the current
 * template and purchased powers. Call after every trait change. */
export function applyTemplate(c: ICinChar): void {
  const t = c.template ? templateDef(c.template) : undefined;
  const bonus: Partial<Record<AttrKey, number>> = {
    ...(t?.attrBonus ?? {}),
  };
  for (const e of c.qualities) {
    const p = powerDef(e.slug);
    if (!p?.attrBonus) continue;
    for (const [k, v] of Object.entries(p.attrBonus)) {
      const key = k as AttrKey;
      bonus[key] = (bonus[key] ?? 0) + (v as number);
    }
  }
  c.attrBonus = bonus;
  if (t?.weaknesses && !c.weaknesses) c.weaknesses = t.weaknesses;
  for (const inc of t?.includes ?? []) {
    if (!c.qualities.some((e) => e.slug === inc.slug)) {
      c.qualities.push({
        slug: inc.slug,
        level: inc.level,
        note: "",
        granted: true,
      });
    }
  }
}

/** Select a template: buys its primary Quality (caller pool-checks),
 * swaps out any previous template, then applies the package. */
export function setTemplate(c: ICinChar, input: string): string | null {
  const q = input.trim().toLowerCase();
  if (["mortal", "human", "none", ""].includes(q)) {
    clearTemplate(c);
    return null;
  }
  const t = templateDef(input);
  if (!t || t.slug === "mortal") return `Unknown template: ${input}`;
  const newQ = templateQualitySlug(t.slug);
  if (!newQ) return `Template ${t.name} has no Quality mapping.`;
  for (const oldQ of Object.values(TEMPLATE_QUALITY)) {
    if (oldQ !== newQ) removeEntry(c, oldQ);
  }
  if (!c.qualities.some((e) => e.slug === newQ)) {
    c.qualities.push({ slug: newQ, level: 1, note: "" });
  }
  c.template = t.name;
  applyTemplate(c);
  return null;
}

/** Clear template: drop its Quality, granted packages, bonus, weakness. */
export function clearTemplate(c: ICinChar): void {
  const t = c.template ? templateDef(c.template) : undefined;
  for (const qslug of Object.values(TEMPLATE_QUALITY)) {
    removeEntry(c, qslug);
  }
  for (const inc of t?.includes ?? []) {
    const e = c.qualities.find((x) => x.slug === inc.slug);
    if (e?.granted) removeEntry(c, inc.slug);
  }
  c.template = "";
  if (t?.weaknesses && c.weaknesses === t.weaknesses) {
    c.weaknesses = "";
  }
  applyTemplate(c);
}

/** Autofill template from a supernatural quality just taken. */
export function autoTemplate(c: ICinChar, slug: string): void {
  const name = templateForQuality(slug);
  if (name && !c.template) {
    c.template = name;
    applyTemplate(c);
  }
}
