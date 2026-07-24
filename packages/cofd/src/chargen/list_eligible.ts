/**
 * Eligibility filters for +cg/list.
 *
 * Only options the current chargen (or live) sheet can actually take are
 * shown. Merits use checkPrerequisites; template-locked catalogs hide when
 * the sheet is the wrong splat; gifts/contracts use the same gates as
 * +cg/gift and +cg/contract.
 */

import {
  COFD_MERITS,
  CTL_CONTRACTS,
  CTL_SEEMINGS,
  CTL_COURTS,
  CTL_REGALIA,
  CTL_KITHS,
  kithsForSeeming,
  findSeeming,
  WTF_AUSPICES,
  WTF_TRIBES,
  WTF_RENOWN,
  WTF_GIFTS,
  WTF_RITES,
  type MeritDefinition,
  type CtlContract,
  type CtlKith,
  type WtfGift,
  type WtfRite,
} from "../dictionary/index.ts";
import { checkPrerequisites } from "../support/prereq.ts";
import {
  defaultSheet,
  migrateSheet,
  type CofdSheet,
} from "../stats/index.ts";
import {
  auspiceMoonGift,
  shadowAffinityGifts,
} from "./gifts.ts";
import { favoredRegalia } from "./contracts.ts";

export type ListSheet = CofdSheet | null | undefined;

function tmplOf(sheet: CofdSheet): string {
  return (sheet.template || "mortal").toLowerCase().trim();
}

/** Normalize optional sheet; null → blank mortal draft. */
export function listSheetOrDefault(sheet: ListSheet): CofdSheet {
  if (!sheet) return defaultSheet();
  return migrateSheet(sheet);
}

export function isChangeling(sheet: CofdSheet): boolean {
  return tmplOf(sheet) === "changeling";
}

export function isWerewolf(sheet: CofdSheet): boolean {
  return tmplOf(sheet) === "werewolf";
}

/** Merit is listable when its prereqs all pass on the sheet. */
export function eligibleMerits(sheet: CofdSheet): MeritDefinition[] {
  return COFD_MERITS.filter((m) => {
    const prereqs = m.prereqs ?? [];
    if (prereqs.length === 0) return true;
    return checkPrerequisites(prereqs, sheet).valid;
  });
}

export function eligibleSeemings(sheet: CofdSheet) {
  return isChangeling(sheet) ? [...CTL_SEEMINGS] : [];
}

/**
 * Kiths the sheet can take. When seeming is set, only that seeming's
 * kiths; otherwise all kiths (player still picking identity).
 */
export function eligibleKiths(sheet: CofdSheet): CtlKith[] {
  if (!isChangeling(sheet)) return [];
  const seeming = (sheet.customFields?.seeming ?? "").trim();
  if (seeming) {
    const s = findSeeming(seeming);
    if (s) return [...kithsForSeeming(s.name)];
  }
  return [...CTL_KITHS];
}

export function eligibleCourts(sheet: CofdSheet) {
  return isChangeling(sheet) ? [...CTL_COURTS] : [];
}

export function eligibleRegalia(sheet: CofdSheet) {
  return isChangeling(sheet) ? [...CTL_REGALIA] : [];
}

export function eligibleAuspices(sheet: CofdSheet) {
  return isWerewolf(sheet) ? [...WTF_AUSPICES] : [];
}

export function eligibleTribes(sheet: CofdSheet) {
  return isWerewolf(sheet) ? [...WTF_TRIBES] : [];
}

export function eligibleRenown(sheet: CofdSheet) {
  return isWerewolf(sheet) ? [...WTF_RENOWN] : [];
}

/**
 * Gifts the sheet may draw starting facets from.
 * Moon → auspice only; Shadow → tribal affinity (or all for Ghost Wolves);
 * Wolf → all wolf gifts. Empty when not werewolf / no auspice for moon.
 */
export function eligibleGifts(sheet: CofdSheet): WtfGift[] {
  if (!isWerewolf(sheet)) return [];
  const out: WtfGift[] = [];
  const moon = auspiceMoonGift(sheet);
  if (moon) out.push(moon);
  out.push(...shadowAffinityGifts(sheet));
  out.push(...WTF_GIFTS.filter((g) => g.type === "wolf"));
  // De-dupe by name
  const seen = new Set<string>();
  return out.filter((g) => {
    const k = g.name.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** All rites are open to werewolves at creation (dot budget is separate). */
export function eligibleRites(sheet: CofdSheet): WtfRite[] {
  return isWerewolf(sheet) ? [...WTF_RITES] : [];
}

/**
 * Contracts the sheet may choose at chargen (ignoring pool capacity).
 * Goblin always; court of own court; royal arcadian only from favored
 * Regalia; common arcadian of any Regalia.
 */
export function eligibleContracts(sheet: CofdSheet): CtlContract[] {
  if (!isChangeling(sheet)) return [];
  const court = (sheet.customFields?.court ?? "").trim().toLowerCase();
  const fav = favoredRegalia(sheet).map((r) => r.toLowerCase());
  return CTL_CONTRACTS.filter((c) => {
    if (c.type === "goblin") return true;
    if (c.type === "court") {
      if (!court) return false;
      return (c.court ?? "").toLowerCase() === court;
    }
    if (c.type === "arcadian" && c.tier === "royal") {
      if (fav.length === 0) return false;
      return fav.includes((c.regalia ?? "").toLowerCase());
    }
    // Common Arcadian — any Regalia
    return true;
  });
}

/** Topic keys that make sense for this sheet's template. */
export function eligibleListTopics(sheet: CofdSheet): Set<string> {
  const topics = new Set([
    "virtues",
    "vices",
    "templates",
    "merits",
  ]);
  if (isChangeling(sheet)) {
    for (const k of [
      "seemings",
      "kiths",
      "courts",
      "regalia",
      "contracts",
    ]) {
      topics.add(k);
    }
  }
  if (isWerewolf(sheet)) {
    for (const k of [
      "auspices",
      "tribes",
      "renown",
      "gifts",
      "rites",
    ]) {
      topics.add(k);
    }
  }
  return topics;
}

export function wrongTemplateMsg(
  topic: string,
  need: "changeling" | "werewolf",
): string {
  const label = need === "changeling"
    ? "Changeling: the Lost"
    : "Werewolf: the Forsaken";
  return (
    `${topic} are only listed for ${label} characters. ` +
    `Set template with +cg/set template=${need}.`
  );
}
