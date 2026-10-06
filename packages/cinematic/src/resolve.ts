/** Partial-name resolution for attributes and skills. */
import { SKILLS } from "./data.ts";
import { ATTRS, type AttrKey } from "./types.ts";

/** Normalize a name to a catalog slug: "cop/detective" and
 * "Mr. Fix-It" both resolve. */
export function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[/.\s]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Resolve "dex", "str", "int"… (or full names) to an AttrKey.
 * Returns undefined if nothing matches. */
export function resolveAttr(input: string): AttrKey | undefined {
  const q = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!q) return undefined;
  const exact = ATTRS.find((a) =>
    a === q || a.startsWith(q) && a === q
  );
  if (exact) return exact;
  const matches = ATTRS.filter((a) => a.startsWith(q));
  return matches.length === 1 ? matches[0] : undefined;
}

export type SkillMatch =
  | { slug: string }
  | { error: string };

/** Resolve "kung", "gun", "acro"… (or full slugs/names) to a skill.
 * Ambiguous prefixes return an error listing the candidates. */
export function resolveSkill(input: string): SkillMatch {
  const q = slugify(input);
  if (!q) return { error: "No skill given." };
  const exact = SKILLS.find((s) => s.slug === q);
  if (exact) return { slug: exact.slug };
  const named = SKILLS.find((s) => slugify(s.name) === q);
  if (named) return { slug: named.slug };
  const matches = SKILLS.filter((s) =>
    s.slug.startsWith(q) || slugify(s.name).startsWith(q)
  );
  if (matches.length === 1) return { slug: matches[0].slug };
  if (matches.length > 1) {
    return {
      error: "Ambiguous: " +
        matches.map((m) => m.slug).join(", "),
    };
  }
  return { error: `Unknown skill: ${input}` };
}

export interface TraitSpec {
  slug: string;
  level: number;
  note: string;
}

/** Parse "<slug>[=<rating>][:<qualifier>]".
 * null = malformed slug; error = bad rating. */
export function traitEntry(
  raw: string,
): TraitSpec | { error: string } | null {
  const slug = slugify(raw.split("=")[0].split(":")[0]);
  if (!slug) return null;
  const lv = raw.split("=")[1]?.split(":")[0] ?? "1";
  const n = parseInt(lv, 10);
  if (Number.isNaN(n) === false && n < 0) {
    return { error: "Rating cannot be negative." };
  }
  const level = Math.max(1, n || 1);
  const note = raw.split(":").slice(1).join(":").trim();
  return { slug, level, note };
}
