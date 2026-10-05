/**
 * Software obsolescence + demon pack slot math.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import {
  resolveSoftware,
  softwareSlotCost,
} from "./net.ts";

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

/** Slugs that still give bonuses (not obsolete). */
export function liveSoftware(c: ISprawlChar): string[] {
  const dead = new Set(c.softwareObsolete ?? []);
  return (c.software ?? []).filter((s) => !dead.has(s));
}

export function isObsolete(c: ISprawlChar, slug: string): boolean {
  return (c.softwareObsolete ?? []).includes(slug);
}

/**
 * Slot use: demons cost 1; packed soft inside don't count.
 * Loose soft count normally. Obsolete still occupy slots.
 */
export function usedSlotsWithPacks(c: ISprawlChar): number {
  const packs = c.softwarePacks ?? {};
  const packed = new Set<string>();
  for (const list of Object.values(packs)) {
    for (const s of list) packed.add(s);
  }
  let n = 0;
  for (const s of c.software ?? []) {
    if (packed.has(s)) continue;
    n += softwareSlotCost(s);
  }
  return n;
}

/** Pack software into a demon (must both be loaded). */
export function packIntoDemon(
  c: ISprawlChar,
  demonSlug: string,
  softSlugs: string[],
): ISprawlChar | { error: string } {
  const demon = resolveSoftware(demonSlug);
  if (!demon || String(demon.effect) !== "demon-pack") {
    return { error: "not a demon pack" };
  }
  if (!(c.software ?? []).includes(demon.slug)) {
    return { error: "load the demon first" };
  }
  const max = Number(demon.packSize ?? 2);
  const have = c.software ?? [];
  const clean: string[] = [];
  for (const s of softSlugs) {
    const row = resolveSoftware(s);
    if (!row) return { error: `unknown ${s}` };
    if (!have.includes(row.slug)) {
      return { error: `${row.slug} not loaded` };
    }
    if (String(row.effect) === "demon-pack") {
      return { error: "can't pack a demon into a demon" };
    }
    clean.push(row.slug);
  }
  if (clean.length > max) {
    return { error: `${demon.slug} holds max ${max}` };
  }
  if (!clean.length) return { error: "name software to pack" };
  const packs = { ...(c.softwarePacks ?? {}) };
  packs[demon.slug] = clean;
  return { ...c, softwarePacks: packs };
}

export function unpackDemon(
  c: ISprawlChar,
  demonSlug: string,
): ISprawlChar | { error: string } {
  const packs = { ...(c.softwarePacks ?? {}) };
  const key = resolveSoftware(demonSlug)?.slug ?? demonSlug;
  if (!packs[key]?.length) {
    return { error: "nothing packed in that demon" };
  }
  delete packs[key];
  return { ...c, softwarePacks: packs };
}

/**
 * Between missions: d6 per live program; 1 = obsolete.
 * Book: no longer provides any bonus.
 */
export function rollSoftwareObsolescence(
  c: ISprawlChar,
  rng: () => number = Math.random,
): { next: ISprawlChar; died: string[] } {
  const dead = new Set(c.softwareObsolete ?? []);
  const died: string[] = [];
  for (const s of c.software ?? []) {
    if (dead.has(s)) continue;
    if (String(resolveSoftware(s)?.effect) === "demon-pack") {
      continue;
    }
    if (d6(rng) === 1) {
      dead.add(s);
      died.push(s);
    }
  }
  if (!died.length) return { next: c, died };
  return {
    next: { ...c, softwareObsolete: [...dead] },
    died,
  };
}

/** Drop obsolete entry when unloading. */
export function clearObsoleteOnUnload(
  c: ISprawlChar,
  slug: string,
): ISprawlChar {
  const obs = (c.softwareObsolete ?? []).filter((s) => s !== slug);
  const packs = { ...(c.softwarePacks ?? {}) };
  for (const [d, list] of Object.entries(packs)) {
    packs[d] = list.filter((s) => s !== slug);
    if (!packs[d]!.length) delete packs[d];
  }
  return {
    ...c,
    softwareObsolete: obs.length ? obs : undefined,
    softwarePacks: Object.keys(packs).length ? packs : undefined,
  };
}
