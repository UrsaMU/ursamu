/**
 * Nodejacker Fast Hacks — pool = Cognition + RAM d6.
 * Sum + flat bonuses must beat DS. 1s → response, 6s → exploit.
 * Fail also triggers one automatic System Response.
 */
import { NET_EXPLOITS, type Row } from "./catalog.ts";
import {
  rollD66Index,
  rollSystemResponse,
  type SysResponse,
} from "./net.ts";

export type FastHackInput = {
  cognition: number;
  ram: number;
  /** Dice to roll; default full pool. Clamped 1..max. */
  diceCount?: number;
  /** Flat adds: console, software, augs (not Cog). */
  bonuses: number;
  ds: number;
  glitch?: number;
  upgrade?: number;
};

export type NetExploitHit = {
  slug: string;
  name: string;
  blurb: string;
  roll: string;
};

export type IFastHackResult = {
  poolMax: number;
  diceCount: number;
  rolled: number[];
  kept: number[];
  diceSum: number;
  bonuses: number;
  total: number;
  ds: number;
  success: boolean;
  margin: number;
  ones: number;
  sixes: number;
  mode: "normal" | "glitch" | "upgrade";
  damageToSelf: number;
  responses: SysResponse[];
  exploits: NetExploitHit[];
};

/** rng is Math.random-style [0, 1). */
function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

export function maxFastHackDice(
  cognition: number,
  ram: number,
): number {
  const c = Math.max(0, Math.floor(cognition));
  const r = Math.max(0, Math.floor(ram));
  return Math.max(1, c + r);
}

/** Accepts: d3 #3 pool3 pool:3 3d dice:3 */
export function parsePoolDice(
  tokens: string[],
): { dice?: number; rest: string[] } {
  const rest: string[] = [];
  let dice: number | undefined;
  for (const t of tokens) {
    const m = t.match(/^(?:d|#|pool:?|dice:?)(\d+)$/i) ??
      t.match(/^(\d+)d$/i);
    if (m) {
      dice = Math.max(1, Number(m[1]));
      continue;
    }
    rest.push(t);
  }
  return { dice, rest };
}

function netMode(
  glitch: number,
  upgrade: number,
): "normal" | "glitch" | "upgrade" {
  const g = Math.max(0, glitch);
  const u = Math.max(0, upgrade);
  if (g === u) return "normal";
  if (g > u) return "glitch";
  return "upgrade";
}

function rollPool(
  n: number,
  mode: "normal" | "glitch" | "upgrade",
  extra: number,
  rng: () => number,
): { rolled: number[]; kept: number[] } {
  const take = Math.max(1, n);
  if (mode === "normal" || extra <= 0) {
    const kept: number[] = [];
    for (let i = 0; i < take; i++) kept.push(d6(rng));
    return { rolled: [...kept], kept };
  }
  const all: number[] = [];
  for (let i = 0; i < take + extra; i++) all.push(d6(rng));
  const sorted = [...all].sort((a, b) => a - b);
  const kept = mode === "glitch"
    ? sorted.slice(0, take)
    : sorted.slice(sorted.length - take);
  return { rolled: all, kept };
}

export function rollNetExploit(
  rng: () => number = Math.random,
): NetExploitHit {
  const rows = NET_EXPLOITS;
  const i = rollD66Index(rows, rng);
  const r = rows[i] as Row;
  return {
    slug: r.slug,
    name: String(r.name ?? r.slug),
    blurb: String(r.blurb ?? ""),
    roll: String(r.roll ?? ""),
  };
}

/** Success if total **>** DS. Cognition is pool size only. */
export function resolveFastHack(
  input: FastHackInput,
  rng: () => number = Math.random,
): IFastHackResult {
  const poolMax = maxFastHackDice(input.cognition, input.ram);
  let diceCount = input.diceCount ?? poolMax;
  diceCount = Math.max(
    1,
    Math.min(poolMax, Math.floor(diceCount)),
  );

  const g = Math.max(0, input.glitch ?? 0);
  const u = Math.max(0, input.upgrade ?? 0);
  const mode = netMode(g, u);
  const extra = mode === "normal" ? 0 : Math.abs(g - u);
  const { rolled, kept } = rollPool(
    diceCount,
    mode,
    extra,
    rng,
  );
  const diceSum = kept.reduce((a, b) => a + b, 0);
  const bonuses = input.bonuses;
  const total = diceSum + bonuses;
  const ds = input.ds;
  const success = total > ds;
  const margin = Math.abs(total - ds);
  const ones = kept.filter((d) => d === 1).length;
  const sixes = kept.filter((d) => d === 6).length;

  const responses: SysResponse[] = [];
  for (let i = 0; i < ones; i++) {
    responses.push(rollSystemResponse(rng));
  }
  if (!success) responses.push(rollSystemResponse(rng));

  const exploits: NetExploitHit[] = [];
  for (let i = 0; i < sixes; i++) {
    exploits.push(rollNetExploit(rng));
  }

  return {
    poolMax,
    diceCount,
    rolled,
    kept,
    diceSum,
    bonuses,
    total,
    ds,
    success,
    margin,
    ones,
    sixes,
    mode,
    damageToSelf: success ? 0 : Math.max(1, margin),
    responses,
    exploits,
  };
}

export function formatFastHackDice(r: IFastHackResult): string {
  let s = `[${r.kept.join("+")}]`;
  if (r.rolled.length !== r.kept.length && r.mode !== "normal") {
    s += ` raw[${r.rolled.join("+")}]`;
  }
  if (r.mode !== "normal") s += ` (${r.mode})`;
  return s;
}
