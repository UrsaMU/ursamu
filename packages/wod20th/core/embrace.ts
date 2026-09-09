// core/embrace.ts -- Embrace mortal -> Kindred neonate; create ghouls.

import type { IWoDChar } from "./types.ts";
import { isKindred } from "./kindred.ts";
import { applyGenerationPools } from "../splats/vtm/data/generation.ts";
import { initTrack } from "./health.ts";
import { ensureMalkavianDerangement } from "./derangement.ts";
import { getClanDef } from "./clanWeakness.ts";

export interface IEmbraceResult {
  ok: boolean;
  message: string;
}

/**
 * Convert an approved mortal (or kinfolk) into a neonate Kindred.
 * Inherits sire clan/generation+1 (capped 15). Resets blood pools.
 */
export function embraceMortal(
  sire: IWoDChar,
  childe: IWoDChar,
): IEmbraceResult {
  if (!isKindred(sire)) {
    return { ok: false, message: "Only Kindred can Embrace." };
  }
  if (isKindred(childe)) {
    return { ok: false, message: "Target is already Kindred." };
  }
  if (childe.status !== "approved") {
    return { ok: false, message: "Target must be approved." };
  }
  const sireGen = sire.generation ?? 13;
  const gen = Math.min(15, sireGen + 1);
  const pools = applyGenerationPools(gen);

  childe.splat = "vtm";
  childe.clan = sire.clan ?? "caitiff";
  childe.generation = gen;
  childe.sect = sire.sect;
  childe.bloodMax = pools.bloodMax;
  childe.bloodPerTurn = pools.bloodPerTurn;
  childe.bloodPool = pools.bloodMax;
  childe.humanity = Math.min(childe.humanity ?? 7, 7);
  childe.path = childe.path ?? "Humanity";
  childe.virtues = childe.virtues ?? {
    Conscience: 2,
    "Self-Control": 2,
    Courage: 2,
  };
  childe.disciplines = childe.disciplines ?? {};
  // Clear ghoul state on Embrace.
  childe.isGhoul = undefined;
  childe.domitorId = undefined;
  childe.ghoulLastFedAt = undefined;
  childe.ghoulDisciplines = undefined;
  // Clan hooks.
  ensureMalkavianDerangement(childe);
  const clan = getClanDef(childe);
  if (clan?.appearanceZero) {
    childe.attributes = { ...(childe.attributes ?? {}), Appearance: 0 };
  }
  if (clan?.weaknessKind === "feed_restrict" && sire.feedingPreference) {
    childe.feedingPreference = sire.feedingPreference;
  }
  // Tremere: one step toward clan bond to sire.
  if (clan?.weaknessKind === "clan_bond") {
    childe.bonds = {
      ...(childe.bonds ?? {}),
      [sire.id]: Math.max(1, childe.bonds?.[sire.id] ?? 0),
    };
  }
  if (!childe.healthTrack) childe.healthTrack = initTrack();

  return {
    ok: true,
    message:
      `Embraced as ${childe.clan} neonate, generation ${gen}. ` +
      `Blood ${pools.bloodMax}/${pools.bloodPerTurn} per turn.`,
  };
}

/**
 * Bind a mortal as a ghoul of the Kindred domitor.
 * Ghouls keep mortal splat but gain a tiny blood pool and isGhoul.
 */
export function makeGhoul(
  domitor: IWoDChar,
  thrall: IWoDChar,
): IEmbraceResult {
  if (!isKindred(domitor)) {
    return { ok: false, message: "Only Kindred create ghouls." };
  }
  if (isKindred(thrall)) {
    return { ok: false, message: "Kindred cannot be ghouled." };
  }
  if (thrall.status !== "approved") {
    return { ok: false, message: "Target must be approved." };
  }
  thrall.isGhoul = true;
  thrall.domitorId = domitor.id;
  thrall.bloodMax = 2;
  thrall.bloodPerTurn = 1;
  thrall.bloodPool = 2;
  thrall.ghoulLastFedAt = Date.now();
  // First drink of bond.
  thrall.bonds = {
    ...(thrall.bonds ?? {}),
    [domitor.id]: Math.max(1, thrall.bonds?.[domitor.id] ?? 0),
  };
  return {
    ok: true,
    message:
      `Ghouled under ${domitor.id}. Blood pool 2; bond 1+ to domitor. ` +
      `Feed vitae monthly (+embrace/vitae) or face withdrawal.`,
  };
}
