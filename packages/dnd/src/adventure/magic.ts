/**
 * Magic item catalog + attunement helpers.
 */
import type { DndSheet } from "../stats/dnd_sheet.ts";
import magicJson from "../../resources/magic-items.json" with {
  type: "json",
};

export interface MagicItemDef {
  slug: string;
  name: string;
  rarity: string;
  attunement: boolean;
  type: string;
  bonus?: number;
  bonusAc?: number;
  setAbility?: Record<string, number>;
  speed?: number;
  valueGp?: number;
  book?: string;
  summary?: string;
}

export const MAGIC_ITEMS: Record<string, MagicItemDef> =
  magicJson as Record<string, MagicItemDef>;

export function magicBySlug(
  raw: string,
): MagicItemDef | undefined {
  const t = raw.toLowerCase().trim().replace(/\s+/g, "_")
    .replace(/'/g, "");
  return MAGIC_ITEMS[t] ??
    Object.values(MAGIC_ITEMS).find((m) =>
      m.name.toLowerCase() === raw.toLowerCase()
    );
}

export function listMagic(): MagicItemDef[] {
  return Object.values(MAGIC_ITEMS);
}

const MAX_ATTUNE = 3;

export function attunedSlugs(sheet: DndSheet): string[] {
  // deno-lint-ignore no-explicit-any
  const a = (sheet as any).attunement;
  return Array.isArray(a) ? a.map(String) : [];
}

export function canAttune(
  sheet: DndSheet,
  slug: string,
): { ok: boolean; message: string } {
  const def = magicBySlug(slug);
  if (!def) return { ok: false, message: "Unknown magic item." };
  if (!def.attunement) {
    return { ok: false, message: "That item needs no attunement." };
  }
  const cur = attunedSlugs(sheet);
  if (cur.includes(def.slug)) {
    return { ok: false, message: "Already attuned." };
  }
  if (cur.length >= MAX_ATTUNE) {
    return {
      ok: false,
      message: `Already attuned to ${MAX_ATTUNE} items.`,
    };
  }
  return { ok: true, message: "" };
}

export function applyAttune(
  sheet: DndSheet,
  slug: string,
): { sheet: DndSheet; ok: boolean; message: string } {
  const check = canAttune(sheet, slug);
  if (!check.ok) return { sheet, ok: false, message: check.message };
  const def = magicBySlug(slug)!;
  const s = structuredClone(sheet) as DndSheet;
  // deno-lint-ignore no-explicit-any
  const anyS = s as any;
  anyS.attunement = [...attunedSlugs(s), def.slug];
  if (def.setAbility) {
    for (const [ab, val] of Object.entries(def.setAbility)) {
      if (ab in s.abilities) {
        // deno-lint-ignore no-explicit-any
        (s.abilities as any)[ab] = val;
      }
    }
  }
  if (typeof def.speed === "number") {
    s.speed = Math.max(s.speed || 30, def.speed);
  }
  if (typeof def.bonusAc === "number") {
    s.ac = (s.ac || 10) + def.bonusAc;
  }
  return {
    sheet: s,
    ok: true,
    message: `Attuned to ${def.name}.`,
  };
}

export function applyUnattune(
  sheet: DndSheet,
  slug: string,
): { sheet: DndSheet; ok: boolean; message: string } {
  const def = magicBySlug(slug);
  if (!def) return { sheet, ok: false, message: "Unknown item." };
  const cur = attunedSlugs(sheet);
  if (!cur.includes(def.slug)) {
    return { sheet, ok: false, message: "Not attuned to that." };
  }
  const s = structuredClone(sheet) as DndSheet;
  // deno-lint-ignore no-explicit-any
  (s as any).attunement = cur.filter((x) => x !== def.slug);
  // Note: ability/AC revert is best-effort; full recalc needs re-equip.
  if (typeof def.bonusAc === "number") {
    s.ac = Math.max(10, (s.ac || 10) - def.bonusAc);
  }
  return {
    sheet: s,
    ok: true,
    message: `Ended attunement: ${def.name}.`,
  };
}

/** Spawn payload for inventory/chest magic loot. */
export function magicSpawnSpec(def: MagicItemDef): {
  name: string;
  type: string;
  extra: Record<string, unknown>;
} {
  return {
    name: def.name,
    type: def.type || "wondrous",
    extra: {
      magic: def.slug,
      rarity: def.rarity,
      attunement: !!def.attunement,
      bonus: def.bonus,
      valueGp: def.valueGp ?? 0,
      summary: def.summary ?? "",
    },
  };
}
