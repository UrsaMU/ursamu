// NPC template catalog — loads resources/npcs/*.json at import time.
// Shape matches resources/schemas/npc.schema.json (NpcTemplate).

import type { NpcTemplate } from "./types.ts";
import { resolveAiConfig } from "./types.ts";

const NPCS_DIR = new URL(
  "../../resources/npcs/",
  import.meta.url,
);

const ATTR_KEYS = [
  "intelligence",
  "wits",
  "resolve",
  "strength",
  "dexterity",
  "stamina",
  "presence",
  "manipulation",
  "composure",
] as const;

const TIERS = new Set(["minor", "major", "storyteller"]);
const LINEAGES = new Set([
  "mortal",
  "spirit",
  "ghost",
  "host",
  "werewolf",
  "claimed",
  "changeling",
  "hobgoblin",
  "huntsman",
  "fetch",
  "true-fae",
  "other",
]);

const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export interface CatalogLoadError {
  file: string;
  message: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function validateTemplate(
  raw: unknown,
  file: string,
): { ok: true; t: NpcTemplate } | { ok: false; message: string } {
  if (!isRecord(raw)) {
    return { ok: false, message: `${file}: root must be object` };
  }
  const slug = raw.slug;
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    return {
      ok: false,
      message: `${file}: invalid or missing slug`,
    };
  }
  if (typeof raw.name !== "string" || !raw.name.trim()) {
    return { ok: false, message: `${file}: name required` };
  }
  if (typeof raw.tier !== "string" || !TIERS.has(raw.tier)) {
    return { ok: false, message: `${file}: invalid tier` };
  }
  if (
    typeof raw.lineage !== "string" ||
    !LINEAGES.has(raw.lineage)
  ) {
    return { ok: false, message: `${file}: invalid lineage` };
  }
  if (!isRecord(raw.attributes)) {
    return { ok: false, message: `${file}: attributes required` };
  }
  for (const k of ATTR_KEYS) {
    const v = raw.attributes[k];
    if (typeof v !== "number" || v < 1 || v > 5) {
      return {
        ok: false,
        message: `${file}: attributes.${k} must be 1-5`,
      };
    }
  }
  if (!isRecord(raw.skills)) {
    return { ok: false, message: `${file}: skills required` };
  }
  if (
    typeof raw.integrity !== "number" ||
    raw.integrity < 0 ||
    raw.integrity > 10
  ) {
    return { ok: false, message: `${file}: integrity 0-10` };
  }
  if (
    typeof raw.size !== "number" ||
    raw.size < 1 ||
    raw.size > 15
  ) {
    return { ok: false, message: `${file}: size 1-15` };
  }

  const lineage = raw.lineage as string;
  if (lineage === "werewolf" && !isRecord(raw.werewolf)) {
    return {
      ok: false,
      message: `${file}: werewolf block required`,
    };
  }
  if (
    [
      "changeling",
      "hobgoblin",
      "huntsman",
      "fetch",
      "true-fae",
    ].includes(lineage) &&
    !isRecord(raw.changeling)
  ) {
    return {
      ok: false,
      message: `${file}: changeling block required`,
    };
  }
  if (
    (lineage === "spirit" || lineage === "ghost") &&
    !isRecord(raw.spirit)
  ) {
    return {
      ok: false,
      message: `${file}: spirit block required`,
    };
  }
  if (lineage === "host" && !isRecord(raw.host)) {
    return {
      ok: false,
      message: `${file}: host block required`,
    };
  }

  return { ok: true, t: raw as unknown as NpcTemplate };
}

function loadAll(): {
  bySlug: Map<string, NpcTemplate>;
  errors: CatalogLoadError[];
} {
  const bySlug = new Map<string, NpcTemplate>();
  const errors: CatalogLoadError[] = [];

  let entries: Deno.DirEntry[];
  try {
    entries = [...Deno.readDirSync(NPCS_DIR)];
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    errors.push({ file: "npcs/", message: `readDir: ${msg}` });
    return { bySlug, errors };
  }

  for (const ent of entries) {
    if (!ent.isFile || !ent.name.endsWith(".json")) continue;
    const path = new URL(ent.name, NPCS_DIR);
    let text: string;
    try {
      text = Deno.readTextFileSync(path);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ file: ent.name, message: msg });
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      errors.push({ file: ent.name, message: `JSON: ${msg}` });
      continue;
    }
    const v = validateTemplate(raw, ent.name);
    if (!v.ok) {
      errors.push({ file: ent.name, message: v.message });
      continue;
    }
    const key = v.t.slug.toLowerCase();
    if (bySlug.has(key)) {
      errors.push({
        file: ent.name,
        message: `duplicate slug '${key}'`,
      });
      continue;
    }
    bySlug.set(key, v.t);
  }

  return { bySlug, errors };
}

const _loaded = loadAll();

/** Validation errors from last catalog load (empty if clean). */
export const NPC_CATALOG_ERRORS: readonly CatalogLoadError[] =
  _loaded.errors;

/** All loaded templates keyed by lowercase slug. */
export const NPC_TEMPLATES: ReadonlyMap<string, NpcTemplate> =
  _loaded.bySlug;

/** Lookup by slug (case-insensitive). */
export function getNpcTemplate(
  slug: string,
): NpcTemplate | null {
  if (!slug) return null;
  return NPC_TEMPLATES.get(slug.toLowerCase().trim()) ?? null;
}

/** Sorted list of slugs. */
export function npcTemplateKeys(): string[] {
  return [...NPC_TEMPLATES.keys()].sort();
}

/** All templates as array (stable slug order). */
export function listNpcTemplates(): NpcTemplate[] {
  return npcTemplateKeys().map((k) => NPC_TEMPLATES.get(k)!);
}

/** Templates matching every tag (AND). */
export function templatesByTag(
  ...tags: string[]
): NpcTemplate[] {
  const need = tags.map((t) => t.toLowerCase());
  return listNpcTemplates().filter((t) => {
    const have = (t.tags ?? []).map((x) => x.toLowerCase());
    return need.every((n) => have.includes(n));
  });
}

/** Templates of a given lineage. */
export function templatesByLineage(
  lineage: string,
): NpcTemplate[] {
  const L = lineage.toLowerCase();
  return listNpcTemplates().filter(
    (t) => t.lineage.toLowerCase() === L,
  );
}

export { resolveAiConfig };
