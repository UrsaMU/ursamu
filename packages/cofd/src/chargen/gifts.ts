// Werewolf: The Forsaken starting Gift facet + Rite selection (chargen Stage 8).
//
// Enforces the WtF 2e starting package:
//   - 1 facet of the auspice's Moon Gift (facets taken in order, capped by
//     auspice Renown)
//   - 2 facets of Shadow Gifts drawn from the tribe's affinities (1 from any
//     Shadow Gift for tribeless Ghost Wolves)
//   - 1 "flex" facet: the auspice Moon Gift's 2nd facet (if auspice Renown >= 2)
//     OR a Wolf Gift facet
//   - 2 dots of Rites
// Every facet requires at least one dot in its associated Renown.

import {
  WTF_GIFTS,
  findAuspice,
  findTribe,
  findFacet,
  findRite,
  type WtfGift,
  type WtfFacet,
} from "../dictionary/index.ts";
import type { CofdSheet } from "../stats/index.ts";
import type { CofdCgState } from "./state.ts";

function renownDots(sheet: CofdSheet, renownName: string): number {
  return sheet.powers?.[renownName.toLowerCase()] ?? 0;
}

/** Lowercased gift name with the "Gift of (the)" scaffolding stripped. */
function giftCore(name: string): string {
  return name.toLowerCase().replace(/^gift of (the )?/, "").trim();
}

export function isGhostWolf(sheet: CofdSheet): boolean {
  return (sheet.customFields?.tribe ?? "").trim().toLowerCase() === "ghost wolves";
}

/** The Moon Gift belonging to the sheet's auspice, or null if unset/unknown. */
export function auspiceMoonGift(sheet: CofdSheet): WtfGift | null {
  const a = findAuspice(sheet.customFields?.auspice ?? "");
  if (!a) return null;
  return WTF_GIFTS.find(
    (g) => g.type === "moon" && g.auspice?.toLowerCase() === a.name.toLowerCase(),
  ) ?? null;
}

/**
 * The Shadow Gifts a character may draw starting facets from: the tribe's three
 * affinities, or every Shadow Gift for tribeless Ghost Wolves.
 */
export function shadowAffinityGifts(sheet: CofdSheet): WtfGift[] {
  const shadow = WTF_GIFTS.filter((g) => g.type === "shadow");
  const t = findTribe(sheet.customFields?.tribe ?? "");
  if (!t || t.gifts.length === 0) return shadow; // Ghost Wolves: free choice
  const aff = t.gifts.map((s) => s.toLowerCase());
  return shadow.filter((g) => aff.includes(giftCore(g.name)));
}

export interface GiftPackage {
  ghostWolf: boolean;
  auspiceRenown: string;
  auspiceRenownDots: number;
  moonMax: number;     // facets of the auspice Moon Gift allowed at creation
  shadowCount: number; // Shadow facets required (distinct gifts)
  totalFacets: number; // total starting facets
  riteDots: number;    // starting Rite dots
}

/** Compute the starting package for a sheet, or null if auspice is unset. */
export function giftPackage(sheet: CofdSheet): GiftPackage | null {
  const a = findAuspice(sheet.customFields?.auspice ?? "");
  if (!a) return null;
  const ghost = isGhostWolf(sheet);
  const arDots = renownDots(sheet, a.renown);
  return {
    ghostWolf: ghost,
    auspiceRenown: a.renown,
    auspiceRenownDots: arDots,
    moonMax: arDots >= 2 ? 2 : 1,
    shadowCount: ghost ? 1 : 2,
    totalFacets: ghost ? 3 : 4,
    riteDots: 2,
  };
}

interface ChosenFacet { gift: WtfGift; facet: WtfFacet; }

function chosenFacets(sheet: CofdSheet): ChosenFacet[] {
  const out: ChosenFacet[] = [];
  for (const name of sheet.gifts ?? []) {
    const hit = findFacet(name);
    if (hit) out.push(hit);
  }
  return out;
}

function countByType(sheet: CofdSheet): { moon: number; shadow: number; wolf: number } {
  const c = { moon: 0, shadow: 0, wolf: 0 };
  for (const { gift } of chosenFacets(sheet)) c[gift.type]++;
  return c;
}

function riteDotsChosen(sheet: CofdSheet): number {
  return (sheet.rites ?? []).reduce((sum, n) => sum + (findRite(n)?.rank ?? 0), 0);
}

function clone(cgState: CofdCgState): CofdCgState {
  return { ...cgState, sheet: JSON.parse(JSON.stringify(cgState.sheet)) as CofdSheet };
}

function assertWerewolf(sheet: CofdSheet): void {
  if ((sheet.template || "").toLowerCase().trim() !== "werewolf") {
    throw new Error("Only Werewolf: the Forsaken characters choose Gifts and Rites.");
  }
}

/** Add a starting Gift facet by name, enforcing the full WtF gating. */
export function addGiftFacet(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const sheet = next.sheet;
  assertWerewolf(sheet);
  const pkg = giftPackage(sheet);
  if (!pkg) throw new Error("Set your auspice (Stage 3) and Renown (Stage 7) before choosing Gifts.");

  const hit = findFacet(name);
  if (!hit) throw new Error(`No Gift facet named '${name}'. Browse with %ch+cg/list gifts <gift>%cn.`);
  const { gift, facet } = hit;

  const list = (sheet.gifts ??= []);
  if (list.some((n) => n.toLowerCase() === facet.name.toLowerCase())) {
    throw new Error(`You have already chosen '${facet.name}'.`);
  }
  if (renownDots(sheet, facet.renown) < 1) {
    throw new Error(`You need at least one dot of ${facet.renown} Renown to take '${facet.name}'.`);
  }

  const counts = countByType(sheet);

  if (gift.type === "moon") {
    const moon = auspiceMoonGift(sheet);
    if (!moon || moon.name.toLowerCase() !== gift.name.toLowerCase()) {
      throw new Error(`Your auspice's Moon Gift is the ${moon?.name ?? "(none set)"}; you may only take its facets.`);
    }
    const dots = facet.dots ?? 1;
    if (dots > pkg.auspiceRenownDots) {
      throw new Error(`'${facet.name}' needs ${dots} dots of ${pkg.auspiceRenown} Renown; you have ${pkg.auspiceRenownDots}.`);
    }
    for (const lf of moon.facets.filter((f) => (f.dots ?? 1) < dots)) {
      if (!list.some((n) => n.toLowerCase() === lf.name.toLowerCase())) {
        throw new Error(`Moon Gift facets are taken in order; take '${lf.name}' first.`);
      }
    }
    if (counts.moon >= pkg.moonMax) {
      throw new Error(`You can take at most ${pkg.moonMax} Moon Gift facet(s) at creation.`);
    }
  } else if (gift.type === "shadow") {
    const aff = shadowAffinityGifts(sheet);
    if (!aff.some((g) => g.name.toLowerCase() === gift.name.toLowerCase())) {
      const where = pkg.ghostWolf ? "a Shadow Gift" : "one of your tribe's Shadow Gifts";
      throw new Error(`${gift.name} is not ${where}. Allowed: ${aff.map((g) => g.name).join(", ")}.`);
    }
    if (chosenFacets(sheet).some((c) => c.gift.type === "shadow" && c.gift.name.toLowerCase() === gift.name.toLowerCase())) {
      throw new Error(`You already have a facet of ${gift.name}; your Shadow facets must come from different Gifts.`);
    }
    if (counts.shadow >= pkg.shadowCount) {
      throw new Error(`You can take ${pkg.shadowCount} Shadow Gift facet(s) at creation.`);
    }
  } else { // wolf
    if (counts.wolf >= 1) {
      throw new Error("You can take at most one Wolf Gift facet at creation.");
    }
  }

  if (chosenFacets(sheet).length >= pkg.totalFacets) {
    throw new Error(`You have already chosen all ${pkg.totalFacets} starting Gift facets.`);
  }

  list.push(facet.name);
  return next;
}

/** Remove a previously chosen Gift facet by name. */
export function removeGiftFacet(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const list = next.sheet.gifts ?? [];
  const idx = list.findIndex((n) => n.toLowerCase() === name.trim().toLowerCase());
  if (idx < 0) throw new Error(`You have not chosen a facet named '${name}'.`);
  list.splice(idx, 1);
  next.sheet.gifts = list;
  return next;
}

/** Add a starting Rite by name, capped at the package's starting Rite dots. */
export function addRite(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const sheet = next.sheet;
  assertWerewolf(sheet);
  const pkg = giftPackage(sheet);
  if (!pkg) throw new Error("Set your auspice (Stage 3) and Renown (Stage 7) before choosing Rites.");

  const rite = findRite(name);
  if (!rite) throw new Error(`No Rite named '${name}'. Browse with %ch+cg/list rites%cn.`);

  const list = (sheet.rites ??= []);
  if (list.some((n) => n.toLowerCase() === rite.name.toLowerCase())) {
    throw new Error(`You have already chosen '${rite.name}'.`);
  }
  const used = riteDotsChosen(sheet);
  if (used + rite.rank > pkg.riteDots) {
    throw new Error(`'${rite.name}' is rank ${rite.rank}; that exceeds your ${pkg.riteDots} starting Rite dots (used ${used}).`);
  }
  list.push(rite.name);
  return next;
}

/** Remove a previously chosen Rite by name. */
export function removeRite(cgState: CofdCgState, name: string): CofdCgState {
  const next = clone(cgState);
  const list = next.sheet.rites ?? [];
  const idx = list.findIndex((n) => n.toLowerCase() === name.trim().toLowerCase());
  if (idx < 0) throw new Error(`You have not chosen a Rite named '${name}'.`);
  list.splice(idx, 1);
  next.sheet.rites = list;
  return next;
}

/** Validate that the Stage-8 starting package is exactly satisfied. */
export function validateGiftStage(sheet: CofdSheet): { valid: boolean; error?: string } {
  const pkg = giftPackage(sheet);
  if (!pkg) return { valid: false, error: "Auspice and Renown must be set before Gifts can be chosen." };

  const counts = countByType(sheet);
  const total = counts.moon + counts.shadow + counts.wolf;

  if (counts.moon < 1) {
    return { valid: false, error: "Take the first facet of your auspice's Moon Gift." };
  }
  if (counts.shadow !== pkg.shadowCount) {
    return { valid: false, error: `Choose exactly ${pkg.shadowCount} Shadow Gift facet(s) from distinct Gifts. You have ${counts.shadow}.` };
  }
  if (total !== pkg.totalFacets) {
    return { valid: false, error: `Choose exactly ${pkg.totalFacets} starting Gift facets. You have ${total}.` };
  }

  const rd = riteDotsChosen(sheet);
  if (rd !== pkg.riteDots) {
    return { valid: false, error: `Choose exactly ${pkg.riteDots} dots of Rites. You have ${rd}.` };
  }
  return { valid: true };
}

/** Summary numbers used by the Stage-8 instructions renderer. */
export function giftStageProgress(sheet: CofdSheet): {
  pkg: GiftPackage | null;
  moon: number;
  shadow: number;
  wolf: number;
  riteDots: number;
} {
  const c = countByType(sheet);
  return { pkg: giftPackage(sheet), ...c, riteDots: riteDotsChosen(sheet) };
}
