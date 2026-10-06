/** +cg actions: setters, catalog, info, submit. */
import type { IUrsamuSDK } from "@ursamu/mush";
import { skillDef, templateForQuality, traitDef } from "../src/data.ts";
import {
  applyTemplate,
  autoTemplate,
  clearTemplate,
} from "../src/template.ts";
export { catalog } from "../src/catalog.ts";
import { cgProblems, formatCg } from "../src/cg.ts";
import { formatSheet } from "../src/display.ts";
import {
  checkRequired,
  prereqMissing,
  validatePool,
  validateQuality,
  validateSkill,
  validateStat,
} from "../src/validation.ts";
import type { ICinChar, IPrereq, IQEntry } from "../src/types.ts";
import {
  resolveAttr,
  resolveSkill,
  slugify,
  traitEntry,
} from "../src/resolve.ts";
export { slugify };
import { saveChar } from "./chargen.ts";

export async function done(u: IUrsamuSDK, c: ICinChar): Promise<void> {
  if (c.status === "none") c.status = "draft";
  await saveChar(u, c);
  u.send(formatCg(u.util.displayName(u.me, u.me), c));
}

export async function setAttr(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const [name, lv] = rest.split("=");
  const value = parseInt(lv ?? "", 10);
  const key = resolveAttr(name);
  if (!key) {
    u.send(`%crUnknown attribute%cn: ${name}`);
    return;
  }
  const v = validateStat(key, value);
  if (v !== true) {
    u.send(`%cr${v}%cn`);
    return;
  }
  c.attrs[key] = value;
  const pool = validatePool(c);
  if (pool !== true) {
    u.send(`%cr${pool}%cn`);
    return;
  }
  await done(u, c);
}

export async function setSkill(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const [name, lv] = rest.split("=");
  const m = resolveSkill(name);
  if ("error" in m) {
    u.send(`%cr${m.error}%cn`);
    return;
  }
  const slug = m.slug;
  const value = parseInt(lv ?? "", 10);
  const v = validateSkill(slug, value);
  if (v !== true) {
    u.send(`%cr${v}%cn`);
    return;
  }
  if (value === 0) delete c.skills[slug];
  else c.skills[slug] = value;
  const pool = validatePool(c);
  if (pool !== true) {
    u.send(`%cr${pool}%cn`);
    return;
  }
  await done(u, c);
}

export async function addTrait(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
  kind: "quality" | "drawback",
): Promise<void> {
  const e = traitEntry(rest);
  if (!e) {
    u.send(`Usage: +cg/${kind} <name>=<rating>`);
    return;
  }
  if ("error" in e) {
    u.send(`%cr${e.error}%cn`);
    return;
  }
  const v = validateQuality(e.slug, kind);
  if (v !== true) {
    u.send(`%cr${v}%cn`);
    return;
  }
  const q = traitDef(e.slug);
  if (q && "max" in q && q.max && e.level > q.max) {
    u.send(`%cr${q.name} max level is ${q.max}%cn`);
    return;
  }
  const list = kind === "quality" ? c.qualities : c.drawbacks;
  if (list.some((x) => x.slug === e.slug)) {
    u.send("Already taken.");
    return;
  }
  const missing = prereqMissing(c, (q as { prereq?: IPrereq })?.prereq);
  if (missing.length) {
    u.send(`%crRequires: ${missing.join(", ")}%cn`);
    return;
  }
  const approval = (q as { approval?: string })?.approval;
  if (approval) u.send(`%cyNote:%cn ${approval}`);
  list.push(e);
  if (kind === "quality") autoTemplate(c, e.slug);
  applyTemplate(c);
  const pool = validatePool(c);
  if (pool !== true) {
    list.pop();
    applyTemplate(c);
    u.send(`%cr${pool}%cn`);
    return;
  }
  await done(u, c);
}

export async function removeTrait(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const slug = slugify(rest.split("=")[0]);
  const rm = (list: IQEntry[]) => {
    const i = list.findIndex((e) => e.slug === slug);
    if (i >= 0) list.splice(i, 1);
    return i >= 0;
  };
  const removedTf = templateForQuality(slug);
  const ok = rm(c.qualities) || rm(c.drawbacks);
  if (ok) {
    if (removedTf && c.template === removedTf) clearTemplate(c);
    else applyTemplate(c);
  }
  u.send(ok ? `${slug} removed.` : `%crNot found%cn: ${slug}`);
  if (ok) await done(u, c);
}

export function info(slug: string): string {
  const s = skillDef(slug);
  if (s) {
    return [
      `%ch${s.name}%cn`,
      `Linked attribute: ${s.attr}`,
      `Cost: 1/level to 5, +3 per level after (6=8, 7=11, 8=14).`,
    ].join("%r");
  }
  const q = traitDef(slug);
  if (!q) return `%crNot found%cn: ${slug}`;
  return [
    `%ch${q.name}%cn`,
    `Type: ${"kind" in q ? q.kind : "power"}   Cost: ${q.cost}` +
      `${"perLevel" in q && q.perLevel ? "/level" : ""}` +
      (q.max ? `   Max: ${q.max}` : ""),
  ].join("%r");
}

export async function submit(u: IUrsamuSDK, c: ICinChar): Promise<void> {
  if (c.status === "approved") {
    u.send("Character is locked.");
    return;
  }
  const missing = checkRequired(c);
  const problems = cgProblems(c);
  if (missing.length || problems.length) {
    u.send(
      "%crCannot submit%cn — " +
        [...missing, ...problems].join("; "),
    );
    return;
  }
  c.status = "submitted";
  await saveChar(u, c);
  u.send("Character submitted for staff approval.");
}
