/** +cg tier/template/status/contact handlers. */
import type { IUrsamuSDK } from "@ursamu/mush";
import type { CharTypeSlug, ICinChar } from "../src/types.ts";
import { CHAR_TYPES, TEMPLATES } from "../src/data.ts";
import { setTemplate } from "../src/template.ts";
import { validatePool } from "../src/validation.ts";
import { addTrait, done } from "./cg-actions.ts";

const TIER_ALIASES: Record<string, CharTypeSlug> = {
  mortal: "whitehat",
  whitehat: "whitehat",
  hero: "hero",
  veteran: "experienced",
  experienced: "experienced",
};

function slug(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, "-");
}

export async function setTier(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const ct = TIER_ALIASES[slug(rest)];
  if (!ct) {
    u.send("%crTier must be Mortal, Hero, or Veteran.%cn");
    return;
  }
  c.type = ct;
  const t = CHAR_TYPES.find((x) => x.slug === ct);
  c.dramaPoints = t?.dramaPoints ?? 0;
  await done(u, c);
}

export async function setType(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const before = structuredClone(c);
  const err = setTemplate(c, rest);
  if (err) {
    u.send(`%cr${err}%cn. Options: ` +
      TEMPLATES.map((x) => x.name).join(", "));
    return;
  }
  const pool = validatePool(c);
  if (pool !== true) {
    Object.assign(c, before);
    u.send(`%cr${pool}%cn`);
    return;
  }
  await done(u, c);
}

export async function setStatus(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const [org, lvl] = rest.split("=");
  if (!org.trim()) {
    u.send("Usage: +cg/status=<Organization>=<Rating>");
    return;
  }
  await addTrait(u, c, `status=${lvl || 1}:${org.trim()}`, "quality");
}

export async function setContact(
  u: IUrsamuSDK,
  c: ICinChar,
  rest: string,
): Promise<void> {
  const [group, lvl] = rest.split("=");
  if (!group.trim()) {
    u.send("Usage: +cg/contact=<Group>=<Rating>");
    return;
  }
  await addTrait(
    u,
    c,
    `contacts=${lvl || 1}:${group.trim()}`,
    "quality",
  );
}
