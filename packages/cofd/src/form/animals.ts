// Chrysalis animal catalog + unlock / apply helpers (CtL 2e).

import data from "../../resources/animals.json" with { type: "json" };

export interface AnimalForm {
  readonly slug: string;
  readonly name: string;
  readonly size: number;
  readonly strength: number;
  readonly dexterity: number;
  readonly stamina: number;
  readonly speedFactor: number;
  readonly senses: readonly string[];
  readonly movement: readonly string[];
  readonly book: string;
  readonly notes?: string;
}

const freezeAll = <T>(items: T[]): readonly T[] =>
  Object.freeze(items.map((i) => Object.freeze({ ...i })));

export const ANIMAL_FORMS: readonly AnimalForm[] = freezeAll(
  (data.animals as AnimalForm[]).map((a) => ({
    ...a,
    senses: Object.freeze([...(a.senses ?? [])]),
    movement: Object.freeze([...(a.movement ?? [])]),
  })),
);

export function findAnimal(slug: string): AnimalForm | null {
  const q = slug.trim().toLowerCase();
  return (
    ANIMAL_FORMS.find(
      (a) => a.slug === q || a.name.toLowerCase() === q,
    ) ?? null
  );
}

/** Default max animal Size for Chrysalis (Ogre clause: 15). */
export function maxAnimalSize(seeming: string | undefined): number {
  return seeming?.toLowerCase().trim() === "ogre" ? 15 : 7;
}

/** How many animal picks Chrysalis grants (Beast: +2). */
export function chrysalisSlotCount(seeming: string | undefined): number {
  return seeming?.toLowerCase().trim() === "beast" ? 4 : 2;
}

export function hasChrysalis(sheet: {
  contracts?: string[];
}): boolean {
  const list = sheet.contracts ?? [];
  return list.some((c) => c.toLowerCase().trim() === "chrysalis");
}

/**
 * Unlocked animal slugs from customFields.animals
 * (comma-separated) or empty.
 */
export function unlockedAnimals(sheet: {
  customFields?: Record<string, string>;
}): string[] {
  const raw = sheet.customFields?.animals?.trim() ?? "";
  if (!raw) return [];
  return raw
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function animalListLine(): string {
  return ANIMAL_FORMS.map((a) => a.slug).join(", ");
}

export type AnimalsFieldResult =
  | { ok: true; value: string; slugs: string[] }
  | { ok: false; error: string };

/**
 * Validate + normalize animals list for +sheet/set.
 * Empty clears. Dedupes, checks catalog, size cap, slot count.
 */
export function normalizeAnimalsField(
  raw: string,
  seeming: string | undefined,
): AnimalsFieldResult {
  const trimmed = raw.trim();
  if (!trimmed || trimmed.toLowerCase() === "not set") {
    return { ok: true, value: "", slugs: [] };
  }

  const parts = trimmed
    .split(/[,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const seen = new Set<string>();
  const slugs: string[] = [];
  const maxSz = maxAnimalSize(seeming);
  const slots = chrysalisSlotCount(seeming);

  for (const p of parts) {
    const a = findAnimal(p);
    if (!a) {
      return {
        ok: false,
        error: `Unknown animal '${p}'. See +shift/list animals.`,
      };
    }
    if (a.size > maxSz) {
      return {
        ok: false,
        error: `${a.name} is Size ${a.size}; your cap is ${maxSz}.`,
      };
    }
    if (seen.has(a.slug)) continue;
    seen.add(a.slug);
    slugs.push(a.slug);
  }

  if (slugs.length > slots) {
    return {
      ok: false,
      error: `Chrysalis allows ${slots} animals for your seeming ` +
        `(${slugs.length} listed).`,
    };
  }

  return { ok: true, value: slugs.join(","), slugs };
}

/** Active animal catalog entry when formState is animal. */
export function currentAnimal(sheet: {
  formState?: { system?: string; current?: string };
}): AnimalForm | null {
  const fs = sheet.formState;
  if (fs?.system !== "animal" || !fs.current) return null;
  return findAnimal(fs.current);
}
