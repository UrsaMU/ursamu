// Goblin fruit inventory on sheet.hedgeState.

import type { CofdSheet } from "../stats/sheet.ts";
import { fruitCarryCap } from "./fruit_catalog.ts";

export interface CarriedFruit {
  slug: string;
  /** Epoch ms when harvested. */
  gotAt: number;
}

export interface FruitFlag {
  key: string;
  until: number;
}

export function readFruitInv(sheet: CofdSheet): CarriedFruit[] {
  const raw = sheet.hedgeState?.fruit;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        slug: String(o.slug ?? ""),
        gotAt: Number(o.gotAt) || 0,
      };
    })
    .filter((x) => x.slug);
}

export function writeFruitInv(
  sheet: CofdSheet,
  fruit: CarriedFruit[],
): CofdSheet {
  const base = { ...(sheet.hedgeState ?? {}) };
  return {
    ...sheet,
    hedgeState: { ...base, fruit },
  };
}

export function readFruitFlags(sheet: CofdSheet): FruitFlag[] {
  const raw = sheet.hedgeState?.fruitFlags;
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((x) => x && typeof x === "object")
    .map((x) => {
      const o = x as Record<string, unknown>;
      return {
        key: String(o.key ?? ""),
        until: Number(o.until) || 0,
      };
    })
    .filter((x) => x.key);
}

export function writeFruitFlags(
  sheet: CofdSheet,
  fruitFlags: FruitFlag[],
): CofdSheet {
  const base = { ...(sheet.hedgeState ?? {}) };
  return {
    ...sheet,
    hedgeState: { ...base, fruitFlags },
  };
}

export function hasFruitFlag(
  sheet: CofdSheet,
  key: string,
  now: number = Date.now(),
): boolean {
  return readFruitFlags(sheet).some(
    (f) => f.key === key && f.until > now,
  );
}

/**
 * Enforce carry cap when not in Hedge. Oldest rot first.
 * Inside Hedge: unlimited.
 */
export function enforceFruitCap(
  sheet: CofdSheet,
  inHedge: boolean,
  now: number = Date.now(),
): { sheet: CofdSheet; rotted: number } {
  const inv = readFruitInv(sheet);
  if (inHedge || inv.length === 0) {
    return { sheet, rotted: 0 };
  }
  const cap = fruitCarryCap(sheet.powerStatValue ?? 0);
  if (inv.length <= cap) return { sheet, rotted: 0 };
  const sorted = [...inv].sort((a, b) => a.gotAt - b.gotAt);
  const keep = sorted.slice(sorted.length - Math.floor(cap));
  // Prefer keeping newest: drop oldest.
  const rotted = inv.length - keep.length;
  void now;
  return { sheet: writeFruitInv(sheet, keep), rotted };
}

export function addFruit(
  sheet: CofdSheet,
  slug: string,
  inHedge: boolean,
  now: number = Date.now(),
): { sheet: CofdSheet; ok: boolean; reason?: string; rotted: number } {
  const inv = [...readFruitInv(sheet), { slug, gotAt: now }];
  let next = writeFruitInv(sheet, inv);
  const enf = enforceFruitCap(next, inHedge, now);
  next = enf.sheet;
  if (!inHedge) {
    const cap = fruitCarryCap(sheet.powerStatValue ?? 0);
    if (readFruitInv(next).length > cap) {
      return {
        sheet,
        ok: false,
        reason: `Cannot carry more than ${cap} fruits outside the Hedge.`,
        rotted: 0,
      };
    }
  }
  return { sheet: next, ok: true, rotted: enf.rotted };
}

export function removeOneFruit(
  sheet: CofdSheet,
  slug: string,
): { sheet: CofdSheet; ok: boolean } {
  const inv = readFruitInv(sheet);
  const q = slug.toLowerCase().trim();
  const idx = inv.findIndex(
    (f) => f.slug === q || f.slug.replace(/-/g, " ") === q,
  );
  if (idx < 0) return { sheet, ok: false };
  const next = [...inv.slice(0, idx), ...inv.slice(idx + 1)];
  return { sheet: writeFruitInv(sheet, next), ok: true };
}

export function countFruit(
  sheet: CofdSheet,
  slug?: string,
): number {
  const inv = readFruitInv(sheet);
  if (!slug) return inv.length;
  const q = slug.toLowerCase().trim();
  return inv.filter(
    (f) => f.slug === q || f.slug.replace(/-/g, " ") === q,
  ).length;
}
