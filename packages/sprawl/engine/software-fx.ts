/**
 * Nodejacker software — passive prep + post-hack + active run.
 */
import type { ISprawlChar } from "../db/schemas.ts";
import {
  hasSoftware,
  removeSoftware,
  resolveSoftware,
  softwareHackBonus,
} from "./net.ts";
import { netOf, nowMs, withNet } from "./net-state.ts";
import { burnSoftware } from "./net.ts";
import { runSoftwareEffect } from "./software-run.ts";

export { burnSoftware } from "./net.ts";

export type SoftPrep = {
  bonus: number;
  parts: string[];
  neuralSoak: number;
  autoUpgrade: number;
  dsPenalty: number;
  notes: string[];
};

export type SoftUseResult = {
  next: ISprawlChar;
  notes: string[];
  error?: string;
};

function d6(rng: () => number): number {
  return 1 + Math.floor(rng() * 6);
}

function matchOk(rowMatch: string, exploit?: string): boolean {
  if (!rowMatch) return true;
  if (!exploit) return true;
  try {
    return new RegExp(rowMatch, "i").test(exploit);
  } catch {
    return false;
  }
}

/** Passive prep before a Fast Hack roll. */
export function prepareSoftwareHack(
  c: ISprawlChar,
  exploitSlug?: string,
): SoftPrep {
  const hb = softwareHackBonus(c, exploitSlug);
  const notes: string[] = [];
  let autoUpgrade = 0;
  let neuralSoak = 0;
  const ex = (exploitSlug ?? "").toLowerCase();

  for (const slug of c.software ?? []) {
    const row = resolveSoftware(slug);
    if (!row) continue;
    const effect = String(row.effect ?? "");
    if (effect === "neural-soak-2") {
      neuralSoak = Math.max(neuralSoak, 2);
    }
    if (
      effect === "upgrade-control" &&
      matchOk(String(row.match ?? ""), ex)
    ) {
      autoUpgrade += 1;
      notes.push("God Mode → +Upgrade");
    }
    if (
      effect === "upgrade-decrypt" &&
      matchOk(String(row.match ?? "decrypt"), ex)
    ) {
      autoUpgrade += 1;
      notes.push("MrTuring → +Upgrade");
    }
  }
  if (hb.absorbNeural && neuralSoak < 1) neuralSoak = 2;

  const n = c.net ?? {};
  const t = nowMs();
  let dsPenalty = 0;
  if (
    n.softDsPenalty &&
    (!n.softDsPenaltyUntil || n.softDsPenaltyUntil > t)
  ) {
    dsPenalty = n.softDsPenalty;
    notes.push(`soft DS -${dsPenalty}`);
  }

  return {
    bonus: hb.bonus,
    parts: hb.parts,
    neuralSoak,
    autoUpgrade,
    dsPenalty,
    notes,
  };
}

/** After hack: ReBoot, Khali tick, Demon crash. */
export function afterSoftwareHack(
  c: ISprawlChar,
  opts: {
    success: boolean;
    resilienceAfterNeural: number;
    rng?: () => number;
  },
): SoftUseResult {
  const rng = opts.rng ?? Math.random;
  let next = c;
  const notes: string[] = [];
  const n = netOf(next);

  if (n.destroyTurns != null && n.destroyTurns > 0) {
    n.destroyTurns -= 1;
    if (n.destroyTurns <= 0) {
      delete n.destroyTurns;
      notes.push("Khali Grade-9 — target system destroyed");
    } else {
      notes.push(`Khali destroy in ${n.destroyTurns}…`);
    }
    next = withNet(next, n);
  }

  if (
    opts.resilienceAfterNeural <= 0 &&
    hasSoftware(next, "reboot")
  ) {
    next = {
      ...next,
      resilience: Math.min(next.resilienceMax, 2),
    };
    next = burnSoftware(next, "reboot");
    notes.push("ReBoot kicks vitals — Res 2 (spent)");
  }

  const demon = (next.software ?? []).find((s) =>
    s.startsWith("demon-")
  );
  if (demon) {
    const row = resolveSoftware(demon);
    const chance = Number(row?.crashChance ?? 2);
    if (d6(rng) <= chance) {
      const r = removeSoftware(next, demon);
      if (!("error" in r)) {
        next = r;
        notes.push(`${row?.name ?? demon} pack crashed`);
      }
    }
  }

  return { next, notes };
}

/** Active +console/run <slug>. */
export function useSoftware(
  c: ISprawlChar,
  slug: string,
  rng: () => number = Math.random,
): SoftUseResult {
  const row = resolveSoftware(slug);
  if (!row) {
    return { next: c, notes: [], error: "unknown software" };
  }
  if (!hasSoftware(c, row.slug)) {
    return {
      next: c,
      notes: [],
      error: "not loaded — +console/load first",
    };
  }
  return runSoftwareEffect(c, row, rng);
}

export function applyNeuralSoak(
  neural: number,
  soak: number,
): { neural: number; blocked: number } {
  if (neural <= 0 || soak <= 0) {
    return { neural, blocked: 0 };
  }
  const blocked = Math.min(neural, soak);
  return { neural: neural - blocked, blocked };
}
