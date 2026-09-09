// core/diablerie.ts -- Amaranth (diablerie) pure helpers (V20 simplified).

import type { IWoDChar } from "./types.ts";
import { isKindred, kindredBlockMessage, isInTorpor } from "./kindred.ts";
import { isIncapacitated } from "./wounds.ts";
import { applyGenerationPools } from "../splats/vtm/data/generation.ts";
import { humanityCheck, type IHumanityCheckResult } from "./humanity.ts";
import { rollDice, type IDiceRoll } from "./dice.ts";
import { assamiteVitaeDiff } from "./clanWeakness.ts";

export interface IDiablerieResult {
  ok: boolean;
  message: string;
  generationBefore?: number;
  generationAfter?: number;
  stains?: number;
  humanityCheck?: IHumanityCheckResult;
  addictRoll?: IDiceRoll;
  notes?: string[];
}

/**
 * Victim must be Kindred, Incap or torpor, and lower generation number
 * is NOT required -- diablerie of weaker or equal gen still stains;
 * only lower gen (elder) drops generation.
 *
 * Rules (simplified V20):
 * - Predator drinks the heart's blood of a helpless Kindred.
 * - If victim.generation < predator.generation (elder blood),
 *   predator generation decreases by 1 (min 4).
 * - Always: +1 diablerieStain, Humanity check at sin level 2
 *   (casual/callous killing -- or path equivalent).
 * - Victim is destroyed (caller marks Final Death / deletes).
 */
export function attemptDiablerie(
  predator: IWoDChar,
  victim: IWoDChar,
  rng: typeof rollDice = rollDice,
): IDiablerieResult {
  if (!isKindred(predator)) {
    return { ok: false, message: "Only Kindred can commit diablerie." };
  }
  if (!isKindred(victim)) {
    return { ok: false, message: "Victim must be Kindred." };
  }
  if (predator.id === victim.id) {
    return { ok: false, message: "Cannot diablerize yourself." };
  }
  const block = kindredBlockMessage(predator, "commit diablerie");
  if (block) return { ok: false, message: block };

  if (!isIncapacitated(victim) && !isInTorpor(victim)) {
    return {
      ok: false,
      message:
        "Victim must be incapacitated or in torpor to diablerize.",
    };
  }

  const notes: string[] = [];
  const addictDiff = assamiteVitaeDiff(predator);
  let addictRoll: IDiceRoll | undefined;
  if (addictDiff !== null) {
    const sc = Math.max(
      1,
      predator.virtues?.["Self-Control"] ??
        predator.virtues?.Conscience ??
        1,
    );
    addictRoll = rng(sc, addictDiff);
    if (addictRoll.botch || addictRoll.netSuccesses <= 0) {
      notes.push(
        "Assamite vitae addiction: you fail Self-Control -- " +
          "the Beast hungers for more Amaranth.",
      );
    } else {
      notes.push("Assamite resists the addiction this once.");
    }
  }

  const genBefore = predator.generation ?? 13;
  const vicGen = victim.generation ?? 13;
  let genAfter = genBefore;
  // Lower generation number = more potent blood.
  if (vicGen < genBefore) {
    genAfter = Math.max(4, genBefore - 1);
    const pools = applyGenerationPools(genAfter);
    predator.generation = genAfter;
    predator.bloodMax = pools.bloodMax;
    predator.bloodPerTurn = pools.bloodPerTurn;
    if ((predator.bloodPool ?? 0) > pools.bloodMax) {
      predator.bloodPool = pools.bloodMax;
    }
    notes.push(
      `Generation ${genBefore} -> ${genAfter} ` +
        `(drank ${vicGen}th blood).`,
    );
  } else {
    notes.push(
      `No generation drop (victim gen ${vicGen} is not lower ` +
        `than yours ${genBefore}).`,
    );
  }

  // Drain remaining blood into predator.
  const take = victim.bloodPool ?? 0;
  if (take > 0) {
    const max = predator.bloodMax ?? 10;
    const cur = predator.bloodPool ?? 0;
    predator.bloodPool = Math.min(max, cur + take);
    victim.bloodPool = 0;
    notes.push(`Absorbed ${take} Blood.`);
  }

  predator.diablerieStains = (predator.diablerieStains ?? 0) + 1;
  predator.lastDiablerieAt = Date.now();
  notes.push(
    `Diablerie stains: ${predator.diablerieStains} ` +
      `(black veins in aura).`,
  );

  // Humanity / path check -- sin level 2 (heinous killing).
  const hum = humanityCheck(predator, 2, rng);
  notes.push(hum.message);

  // Victim is emptied -- mark torpor + zero pools; caller handles Final Death.
  victim.bloodPool = 0;
  victim.inTorpor = true;
  victim.willpowerCurrent = 0;

  return {
    ok: true,
    message:
      `Diablerie complete against gen ${vicGen}. ` + notes.join(" "),
    generationBefore: genBefore,
    generationAfter: genAfter,
    stains: predator.diablerieStains,
    humanityCheck: hum,
    addictRoll,
    notes,
  };
}

