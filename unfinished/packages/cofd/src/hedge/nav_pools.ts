// Hedge navigation pool / target construction (CtL 2e p.200).
import type { CofdSheet } from "../stats/sheet.ts";
import { effectiveAttr, effectiveSkill } from "../stats/effective.ts";
import { hasFruitFlag } from "./fruit_inv.ts";
import type { HedgeRoom } from "./types.ts";

export type NavUrgency = "none" | "some" | "more" | "most";
export interface NavContext {
  room: HedgeRoom | null;
  milestones?: number;
  urgency?: NavUrgency;
  hedgeHasEdge?: boolean;
  bedlam?: boolean;
  bedlamExceptional?: boolean;
}
export interface NavPools {
  playerPool: number;
  hedgePool: number;
  target: number;
  autoSuccess: boolean;
  mods: string[];
}

const NEGATIVE_COND = new Set([
  "shaken", "guilty", "spooked", "broken", "fugue", "madness",
  "insane", "obsessed", "paranoid", "frightened", "lost",
  "soulless", "addicted", "desperate",
]);

const POSITIVE_COND = new Set([
  "inspired", "steadfast", "informed", "leveraged", "swooned",
  "charmed",
]);

export function countCondMods(
  sheet: CofdSheet,
): { pos: number; neg: number } {
  let pos = 0;
  let neg = 0;
  for (const c of sheet.conditions ?? []) {
    const k = c.key.toLowerCase();
    if (POSITIVE_COND.has(k)) pos++;
    if (NEGATIVE_COND.has(k)) neg++;
  }
  return { pos, neg };
}

function targetNumber(
  sheet: CofdSheet,
  ctx: NavContext,
  mods: string[],
): number {
  let target = 8;
  mods.push("target base 8");
  const wyrd = Math.max(0, sheet.powerStatValue ?? 0);
  if (wyrd > 0) {
    target -= wyrd;
    mods.push(`−${wyrd} Wyrd`);
  }
  const miles = Math.max(0, ctx.milestones ?? 0);
  if (miles > 0) {
    target += miles;
    mods.push(`+${miles} milestone`);
  }
  const urgency = ctx.urgency ?? "none";
  if (urgency === "some") {
    target += 1;
    mods.push("+1 urgency");
  } else if (urgency === "more") {
    target += 2;
    mods.push("+2 urgency");
  } else if (urgency === "most") {
    target += 3;
    mods.push("+3 urgency");
  }
  const clarity = sheet.moralityValue ?? 7;
  if (clarity <= 3) {
    const bump = clarity === 1 ? 3 : clarity === 2 ? 2 : 1;
    target += bump;
    mods.push(`+${bump} low Clarity`);
  }
  return Math.max(1, target);
}

function hedgeDice(
  sheet: CofdSheet,
  ctx: NavContext,
  trod: number,
  danger: string,
  turnsSoFar: number,
  hedgeEdge: boolean,
  mods: string[],
): number {
  let hedgePool = 5;
  mods.push("Hedge base 5");
  if (trod > 0) {
    hedgePool -= trod;
    mods.push(`−${trod} trod`);
  }
  if (danger === "thorns") {
    hedgePool += 3;
    mods.push("+3 Thorns");
  }
  const { pos, neg } = countCondMods(sheet);
  if (pos > 0 && neg > 0) {
    mods.push("pos/neg Conditions cancel");
  } else if (pos > 0) {
    hedgePool -= pos;
    mods.push(`−${pos} positive Cond`);
  } else if (neg > 0) {
    hedgePool += neg;
    mods.push(`+${neg} negative Cond`);
  }
  const clarity = sheet.moralityValue ?? 7;
  if (clarity < 5) {
    hedgePool += 1;
    mods.push("+1 Clarity half");
  }
  if ((ctx.urgency ?? "none") !== "none") {
    hedgePool += 2;
    mods.push("+2 time limit");
  }
  if (hedgeEdge || ctx.hedgeHasEdge) {
    hedgePool += 2;
    mods.push("+2 Hedge Edge");
  }
  if (ctx.bedlamExceptional) {
    hedgePool += 3;
    mods.push("+3 Bedlam exc.");
  } else if (ctx.bedlam) {
    hedgePool += 2;
    mods.push("+2 Bedlam");
  }
  if (turnsSoFar > 0) {
    hedgePool += turnsSoFar;
    mods.push(`+${turnsSoFar} turns`);
  }
  return Math.max(0, hedgePool);
}

export function buildNavPools(
  sheet: CofdSheet,
  ctx: NavContext,
  turnsSoFar: number = 0,
  hedgeEdge: boolean = false,
): NavPools {
  const mods: string[] = [];
  const room = ctx.room;
  let danger = room?.danger ?? "hedge";
  // Faerie Peach: Thorns as Hedge, Hedge as trod (CtL p.208).
  if (hasFruitFlag(sheet, "faeriePeach")) {
    if (danger === "thorns") {
      danger = "hedge";
      mods.push("Faerie Peach: Thorns→Hedge");
    } else if (danger === "hedge") {
      danger = "trod";
      mods.push("Faerie Peach: Hedge→trod");
    }
  }
  const trod = danger === "trod" ? (room?.trodRating ?? 1) : 0;
  const urgency = ctx.urgency ?? "none";

  if (trod > 0 && urgency === "none" && !ctx.hedgeHasEdge) {
    return {
      playerPool: 0,
      hedgePool: 0,
      target: 0,
      autoSuccess: true,
      mods: [`trod •${trod} (no chase)`],
    };
  }

  const target = targetNumber(sheet, ctx, mods);
  let playerPool = effectiveAttr(sheet, "wits") +
    effectiveSkill(sheet, "survival");
  if ((sheet.conditions ?? []).some((c) => c.key === "lost")) {
    playerPool -= 2;
    mods.push("−2 Lost");
  }
  if (hasFruitFlag(sheet, "spinPath")) {
    playerPool += 2;
    mods.push("+2 Hedgespun path");
  }
  // Seize the Edge (Hedgespinning subtle, cost 4).
  if (hasFruitFlag(sheet, "spinEdge")) {
    mods.push("spinEdge: auto Edge (player wins tie)");
  }
  // Stable Trod: easier travel on secured paths.
  const trodMerit = sheet.merits?.["stable trod"] ?? 0;
  if (trodMerit > 0 && (room?.danger === "trod" || trod > 0)) {
    playerPool += Math.min(3, trodMerit);
    mods.push(`+${Math.min(3, trodMerit)} Stable Trod`);
  }
  playerPool = Math.max(0, playerPool);
  const hedgePool = hedgeDice(
    sheet,
    ctx,
    trod,
    danger,
    turnsSoFar,
    hedgeEdge,
    mods,
  );

  return {
    playerPool,
    hedgePool,
    target,
    autoSuccess: false,
    mods,
  };
}
