/** Compact plain-text context for LLM injection — no MUSH codes. */
import { charType } from "./data.ts";
import { dramaRemaining, lifePoints } from "./rules.ts";
import {
  ATTRS,
  ATTR_LABELS,
  type ICinChar,
  type IQEntry,
} from "./types.ts";

export function trailer(entries: IQEntry[]): string {
  return entries.map((e) =>
    e.note ? `${e.slug}(${e.note}) ${e.level}` : `${e.slug} ${e.level}`
  ).join(", ");
}

export function formatCharacterContext(c: ICinChar, name: string): string {
  const t = charType(c.type);
  const attrs = ATTRS.map((a) =>
    `${ATTR_LABELS[a]} ${c.attrs[a] ?? 0}`
  ).join(", ");
  const skills = Object.entries(c.skills)
    .filter(([, v]) => v > 0)
    .map(([k, v]) => `${k} ${v}`)
    .join(", ") || "none";
  return [
    `Cinematic Unisystem cast member: ${name}` +
      (t ? ` (${t.name})` : ""),
    `Attributes: ${attrs}`,
    `Skills: ${skills}`,
    `Qualities: ${trailer(c.qualities) || "none"}`,
    `Drawbacks: ${trailer(c.drawbacks) || "none"}`,
    `Drama Points: ${dramaRemaining(c)}`,
    `Life Points: ${lifePoints(c)}`,
    `Status: ${c.status}`,
  ].join("\n");
}
