/**
 * Fire / acid ongoing damage (book specialty ammo).
 * On hit: apply clock + optional immediate first tick.
 * Attackers with active DoTs auto-tick once per +attack.
 */
import type { ISprawlChar } from "../db/schemas.ts";

export type DotKind = "fire" | "acid" | string;

export interface IDot {
  kind: DotKind;
  /** Rounds remaining. */
  rounds: number;
  /** Resilience lost each tick. */
  dmg: number;
  source?: string;
  at: number;
}

export function listDots(c: ISprawlChar): IDot[] {
  return [...(c.dots ?? [])];
}

export function hasDots(c: ISprawlChar): boolean {
  return listDots(c).length > 0;
}

/** Infer fire vs acid from ammo slug/tags string. */
export function dotKindFromAmmo(ammoKey: string): DotKind {
  return /acid|chem/i.test(ammoKey) ? "acid" : "fire";
}

export function addDot(
  c: ISprawlChar,
  dot: Omit<IDot, "at"> & { at?: number },
): ISprawlChar {
  const entry: IDot = {
    kind: dot.kind,
    rounds: Math.max(1, Math.floor(dot.rounds)),
    dmg: Math.max(1, Math.floor(dot.dmg)),
    source: dot.source,
    at: dot.at ?? Date.now(),
  };
  const dots = listDots(c);
  // Stack same kind: refresh rounds, keep higher dmg
  const i = dots.findIndex((d) => d.kind === entry.kind);
  if (i >= 0) {
    const prev = dots[i];
    dots[i] = {
      ...entry,
      rounds: Math.max(prev.rounds, entry.rounds),
      dmg: Math.max(prev.dmg, entry.dmg),
    };
  } else {
    dots.push(entry);
  }
  return { ...c, dots };
}

export type TickResult = {
  next: ISprawlChar;
  totalDmg: number;
  lines: string[];
  cleared: string[];
};

/** Apply one round of all DoTs; reduce rounds. */
export function tickDots(
  c: ISprawlChar,
  applyRes: (c: ISprawlChar, delta: number) => ISprawlChar,
): TickResult {
  const dots = listDots(c);
  if (!dots.length) {
    return { next: c, totalDmg: 0, lines: [], cleared: [] };
  }
  let sheet = c;
  let totalDmg = 0;
  const lines: string[] = [];
  const cleared: string[] = [];
  const kept: IDot[] = [];
  for (const d of dots) {
    sheet = applyRes(sheet, -d.dmg);
    totalDmg += d.dmg;
    const left = d.rounds - 1;
    lines.push(
      `${d.kind} −${d.dmg} Res` +
        (left > 0 ? ` (${left} left)` : " (ends)"),
    );
    if (left > 0) kept.push({ ...d, rounds: left });
    else cleared.push(d.kind);
  }
  const next = { ...sheet, dots: kept.length ? kept : undefined };
  if (!kept.length) delete next.dots;
  return { next, totalDmg, lines, cleared };
}

/**
 * Hit with fire/acid ammo: set clock, then burn once immediately
 * so the victim feels it without a separate +dot/tick.
 */
export function igniteAndTick(
  c: ISprawlChar,
  opts: {
    kind: DotKind;
    rounds: number;
    dmg?: number;
    source?: string;
  },
  applyRes: (c: ISprawlChar, delta: number) => ISprawlChar,
): TickResult & { applied: boolean } {
  const dmg = opts.dmg ?? 1;
  const lit = addDot(c, {
    kind: opts.kind,
    rounds: Math.max(1, opts.rounds),
    dmg,
    source: opts.source,
  });
  const ticked = tickDots(lit, applyRes);
  return { ...ticked, applied: true };
}

export function clearDots(c: ISprawlChar): ISprawlChar {
  const next = { ...c };
  delete next.dots;
  return next;
}
