// core/clanWeakness.ts -- Automated V20 clan weakness hooks.

import type { IWoDChar, IClanDef, IVtmSplatExt } from "./types.ts";
import { SplatRegistry } from "./registry.ts";

export function getClanDef(char: IWoDChar): IClanDef | undefined {
  if (!char.clan) return undefined;
  const ext = SplatRegistry.get("vtm")?.ext as IVtmSplatExt | undefined;
  const q = char.clan.toLowerCase();
  return ext?.clans?.find(
    (c) => c.id === q || c.name.toLowerCase() === q,
  );
}

/** Brujah (and similar): +N to frenzy difficulties. */
export function frenzyDiffBonus(char: IWoDChar): number {
  const clan = getClanDef(char);
  if (!clan) return 0;
  if (clan.frenzyDiffBonus !== undefined) return clan.frenzyDiffBonus;
  if (clan.weaknessKind === "frenzy_diff") return 2;
  return 0;
}

/** Setite: extra sunlight aggravated boxes. */
export function sunDamageBonus(char: IWoDChar): number {
  const clan = getClanDef(char);
  if (!clan) return 0;
  if (clan.sunDamageBonus !== undefined) return clan.sunDamageBonus;
  if (clan.weaknessKind === "sun_extra") return 1;
  return 0;
}

/** Giovanni: max BP taken from a vessel per feed action. */
export function feedPerTurnMax(char: IWoDChar): number | null {
  const clan = getClanDef(char);
  if (!clan) return null;
  if (clan.feedPerTurnMax !== undefined) return clan.feedPerTurnMax;
  if (clan.weaknessKind === "feed_rate") return 1;
  return null;
}

/**
 * Ventrue: must match feedingPreference (substring, case-insensitive).
 * Returns reject message or null if ok.
 */
export function ventrueFeedBlock(
  predator: IWoDChar,
  vesselLabel: string,
): string | null {
  const clan = getClanDef(predator);
  if (!clan || clan.weaknessKind !== "feed_restrict") return null;
  const pref = (predator.feedingPreference ?? "").trim();
  if (!pref) {
    return (
      "Ventrue must set a feeding preference " +
      "(+stat/set feedingPreference=<class of vessel>)."
    );
  }
  if (!vesselLabel.toLowerCase().includes(pref.toLowerCase())) {
    return (
      `Ventrue feeding preference is "${pref}" -- ` +
      `cannot feed on ${vesselLabel}.`
    );
  }
  return null;
}

/**
 * After a failed frenzy resist: Gangrel gain an animal feature.
 * Every 5 features cost 1 permanent Social (Appearance preferred).
 */
export function applyGangrelFrenzyScar(char: IWoDChar): string | null {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "animal_features") return null;
  const n = (char.animalFeatures ?? 0) + 1;
  char.animalFeatures = n;
  let note = `Animal feature #${n} marks you.`;
  if (n > 0 && n % 5 === 0) {
    const attrs = char.attributes ?? {};
    const order = ["Appearance", "Charisma", "Manipulation"] as const;
    for (const a of order) {
      const cur = attrs[a] ?? 1;
      if (cur > 1) {
        attrs[a] = cur - 1;
        char.attributes = attrs;
        note += ` Lost 1 permanent ${a} (5 features).`;
        break;
      }
    }
  }
  return note;
}

/** Toreador: beauty trance -- Self-Control or stand riveted. */
export function toreadorTranceDiff(char: IWoDChar): number | null {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "beauty_trance") return null;
  return 6;
}

/** Lasombra: no reflection (informational flag). */
export function hasNoReflection(char: IWoDChar): boolean {
  const clan = getClanDef(char);
  return clan?.weaknessKind === "no_reflection";
}

/** Malkavian must keep >=1 derangement. */
export function malkavianNeedsDerangement(char: IWoDChar): boolean {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "derangement") return false;
  return (char.derangements?.length ?? 0) < 1;
}

/** Tzimisce soil sleep: half dice pools without native soil rest. */
export function tzimisceSoilPenalty(char: IWoDChar): boolean {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "soil_sleep") return false;
  return char.powerFlags?.sleptOnSoil !== true;
}

/** Assamite: Self-Control when tasting Kindred blood (diablerie bait). */
export function assamiteVitaeDiff(char: IWoDChar): number | null {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "vitae_addict") return null;
  return 6;
}

/**
 * Tremere: -1 die resisting Dominate from higher-gen? Simplified:
 * -1 die vs Dominate from any Tremere with lower generation number
 * (lower gen = more potent).
 */
export function tremereDominatePenalty(
  defender: IWoDChar,
  attacker: IWoDChar,
): number {
  const dClan = getClanDef(defender);
  const aClan = getClanDef(attacker);
  if (dClan?.weaknessKind !== "clan_bond") return 0;
  if (aClan?.id !== "tremere") return 0;
  const dGen = defender.generation ?? 13;
  const aGen = attacker.generation ?? 13;
  // Lower generation number = elder.
  if (aGen < dGen) return 1;
  return 0;
}

/** Ravnos: resist vice when opportunity arises. */
export function ravnosViceDiff(char: IWoDChar): number | null {
  const clan = getClanDef(char);
  if (!clan || clan.weaknessKind !== "vice") return null;
  return 6;
}

/** Summary lines for sheet / +clan. */
export function weaknessSummary(char: IWoDChar): string[] {
  if (char.splat !== "vtm") return [];
  const clan = getClanDef(char);
  if (!clan) return [];
  const lines = [`  Weakness: ${clan.weakness}`];
  if (char.feedingPreference) {
    lines.push(`  Feed pref: ${char.feedingPreference}`);
  }
  if ((char.animalFeatures ?? 0) > 0) {
    lines.push(`  Animal features: ${char.animalFeatures}`);
  }
  if (hasNoReflection(char)) {
    lines.push("  No reflection (mirrors/cameras).");
  }
  if ((char.derangements?.length ?? 0) > 0) {
    lines.push(`  Derangements: ${char.derangements!.join(", ")}`);
  }
  return lines;
}
