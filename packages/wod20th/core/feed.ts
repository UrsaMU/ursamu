// core/feed.ts -- Scene feeding from vessels or Herd (V20 simplified).

import type { IWoDChar } from "./types.ts";
import { applyDamage } from "./health.ts";
import { isIncapacitated } from "./wounds.ts";
import {
  isKindred,
  kindredBlockMessage,
  bloodFeed,
} from "./kindred.ts";
import { maybeEnterTorpor } from "./kindred.ts";
import {
  feedPerTurnMax,
  ventrueFeedBlock,
} from "./clanWeakness.ts";
import { preyExclusionBlock } from "./meritsHooks.ts";

export interface IFeedResult {
  ok: boolean;
  message: string;
  gained?: number;
  vesselDamage?: number;
  vesselDown?: boolean;
  bondNote?: string;
}

function vesselLabel(vessel: IWoDChar): string {
  return (
    vessel.moniker ||
    vessel.fullName ||
    vessel.concept ||
    vessel.splat ||
    "vessel"
  );
}

/**
 * Feed from a living vessel: Kindred gains BP; vessel takes lethal.
 * 1 BP ~= 1 L to vessel (simplified). Overfeed can incap/kill.
 */
export function feedFromVessel(
  predator: IWoDChar,
  vessel: IWoDChar,
  amount: number,
): IFeedResult {
  if (!isKindred(predator)) {
    return { ok: false, message: "Only Kindred feed this way." };
  }
  const block = kindredBlockMessage(predator, "feed");
  if (block) return { ok: false, message: block };
  if (amount < 1 || !Number.isInteger(amount)) {
    return { ok: false, message: "Amount must be a positive integer." };
  }
  if (vessel.id === predator.id) {
    return { ok: false, message: "You cannot feed on yourself." };
  }
  if (isIncapacitated(vessel)) {
    return { ok: false, message: "Vessel is already down." };
  }
  const label = vesselLabel(vessel);
  const vBlock = ventrueFeedBlock(predator, label);
  if (vBlock) return { ok: false, message: vBlock };
  const pBlock = preyExclusionBlock(predator, label);
  if (pBlock) return { ok: false, message: pBlock };

  let want = amount;
  const rateCap = feedPerTurnMax(predator);
  if (rateCap !== null && want > rateCap) {
    want = rateCap;
  }

  // Kindred vessels: take from their blood pool first if any.
  if (isKindred(vessel) && (vessel.bloodPool ?? 0) > 0) {
    const take = Math.min(want, vessel.bloodPool ?? 0);
    vessel.bloodPool = (vessel.bloodPool ?? 0) - take;
    const gain = bloodFeed(predator, take);
    if (!gain.ok) return { ok: false, message: gain.message };
    const giovanniNote = rateCap === 1 && amount > 1
      ? " (Giovanni Kiss: 1 BP/turn max)"
      : "";
    return {
      ok: true,
      message:
        `Drank ${take} from Kindred veins${giovanniNote}. ` +
        `${gain.message} Vessel BP ${vessel.bloodPool}/${vessel.bloodMax}.`,
      gained: take,
      vesselDamage: 0,
      bondNote: "Blood bond may deepen -- +bond/drink.",
    };
  }

  const gain = bloodFeed(predator, want);
  if (!gain.ok) return { ok: false, message: gain.message };
  // Giovanni: vessels rarely survive -- extra lethal on feed.
  const dmg = rateCap === 1 ? want + 1 : want;
  applyDamage(vessel, "L", dmg);
  const down = isIncapacitated(vessel);
  if (isKindred(vessel)) maybeEnterTorpor(vessel);
  const giovanniNote = rateCap === 1
    ? " Giovanni Kiss is agony; vessel takes extra lethal."
    : "";
  return {
    ok: true,
    message:
      `Fed ${want} BP. ${gain.message} ` +
      `Vessel takes ${dmg} lethal` +
      (down ? " and collapses" : "") +
      `.${giovanniNote}`,
    gained: want,
    vesselDamage: dmg,
    vesselDown: down,
    bondNote: "One drink toward a blood bond -- +bond/drink.",
  };
}

/**
 * Feed from Herd background (no vessel object).
 * Herd dots cap how much you can safely take per scene (simplified: dots).
 */
export function feedFromHerd(
  predator: IWoDChar,
  amount = 1,
): IFeedResult {
  if (!isKindred(predator)) {
    return { ok: false, message: "Only Kindred feed this way." };
  }
  const block = kindredBlockMessage(predator, "feed");
  if (block) return { ok: false, message: block };
  const herd = predator.backgrounds?.Herd ??
    predator.backgrounds?.herd ?? 0;
  if (herd < 1) {
    return {
      ok: false,
      message: "No Herd background. Feed on a vessel or raise Herd.",
    };
  }
  const n = Math.max(1, Math.floor(amount));
  if (n > herd) {
    return {
      ok: false,
      message: `Herd ${herd} supports at most ${herd} BP per feeding.`,
    };
  }
  const gain = bloodFeed(predator, n);
  if (!gain.ok) return { ok: false, message: gain.message };
  return {
    ok: true,
    message: `Fed from your Herd (${n} BP). ${gain.message}`,
    gained: n,
  };
}
