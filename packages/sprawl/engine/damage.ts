/**
 * Critical injury tables + mechanical fallout (p.35–37).
 * Sev + location → penalties, bleed, dying clock, flags.
 */
import critTable from "../data/critical-injury.json" with {
  type: "json",
};
import type {
  ICriticalInjury,
  ISprawlChar,
  StatKey,
} from "../db/schemas.ts";

function clampRes(c: ISprawlChar, delta: number): ISprawlChar {
  const next = Math.max(
    0,
    Math.min(c.resilienceMax, c.resilience + delta),
  );
  return { ...c, resilience: next };
}

interface ISev {
  roll: number;
  slug: string;
  effect: string;
  penalty?: number;
  bleed?: number;
  dieRounds?: number;
  flags?: string[];
}
interface ILoc {
  roll: number;
  slug: string;
  stats?: string[];
}

const T = critTable as {
  severity: ISev[];
  locations: ILoc[];
  locationProse?: Record<string, Record<string, string>>;
};

const severity = T.severity;
const locations = T.locations;
const prose = T.locationProse ?? {};

function d6(): number {
  return 1 + Math.floor(Math.random() * 6);
}

function sevEntry(sevRoll: number): ISev {
  if (sevRoll >= 7) {
    return severity.find((s) => s.roll === 7) ??
      severity[severity.length - 1];
  }
  return severity.find((s) => s.roll === sevRoll) ??
    severity[0];
}

function locEntry(locRoll: number): ILoc {
  return locations.find((l) => l.roll === locRoll) ??
    locations[0];
}

function locationFlags(
  loc: string,
  sev: number,
  base: string[],
): string[] {
  const flags = new Set(base);
  flags.add("glitch");
  if (loc === "leg" && sev >= 2) flags.add("no-run");
  if (loc === "arm" && sev >= 2) flags.add("no-wield");
  if (loc === "arm" && sev >= 5) flags.add("limb-out");
  if (loc === "leg" && sev >= 5) flags.add("limb-out");
  if (loc === "head" && sev >= 4) flags.add("blind");
  if (loc === "head" && sev >= 3) flags.add("stun");
  if (sev >= 7) flags.add("dying");
  return [...flags];
}

function proseFor(loc: string, sevKey: string, fallback: string): string {
  const row = prose[loc];
  if (!row) return fallback;
  return row[sevKey] ?? row["7"] ?? fallback;
}

export function rollCritical(
  alreadyCritical: boolean,
  rng: () => number = d6,
): ICriticalInjury {
  let sevRoll = rng();
  if (alreadyCritical) sevRoll += 3;
  const locRoll = rng();
  const sev = sevEntry(sevRoll);
  const loc = locEntry(locRoll);
  const locSlug = loc.slug;
  const sevKey = String(Math.min(sevRoll, 7));
  const effect = proseFor(locSlug, sevKey, sev.effect);
  const penalty = Number(sev.penalty ?? 0);
  const bleed = Number(sev.bleed ?? 0);
  const dieRounds = sev.dieRounds != null
    ? Number(sev.dieRounds)
    : sevRoll >= 7
    ? 2
    : undefined;
  const flags = locationFlags(
    locSlug,
    Math.min(sevRoll, 7),
    sev.flags ?? [],
  );
  // Torso arterial+ always bleeds at least 1
  let bleedOut = bleed;
  if (locSlug === "torso" && sevRoll >= 4 && bleedOut < 1) {
    bleedOut = 1;
  }
  return {
    severity: sevRoll,
    severityName: sev.slug,
    location: locSlug,
    effect,
    at: Date.now(),
    flags,
    penalty: penalty > 0 ? penalty : undefined,
    penaltyStats: loc.stats?.length
      ? loc.stats.map(String)
      : undefined,
    bleed: bleedOut > 0 ? bleedOut : undefined,
    dieRounds,
  };
}

/** Fill mechanical fields if a legacy/shell roll omitted them. */
export function enrichInjury(
  injury: ICriticalInjury,
): ICriticalInjury {
  if (
    injury.flags?.length &&
    (injury.penalty != null || injury.severity <= 1)
  ) {
    return injury;
  }
  const sevRoll = injury.severity;
  const sev = sevEntry(Math.min(sevRoll, 7));
  const loc = injury.location || "torso";
  const locRow = locations.find((l) => l.slug === loc) ??
    locations[1];
  const penalty = injury.penalty ?? Number(sev.penalty ?? 0);
  const bleed = injury.bleed ?? Number(sev.bleed ?? 0);
  const dieRounds = injury.dieRounds ??
    (sev.dieRounds != null
      ? Number(sev.dieRounds)
      : sevRoll >= 7
      ? 2
      : undefined);
  const flags = injury.flags?.length
    ? injury.flags
    : locationFlags(loc, Math.min(sevRoll, 7), sev.flags ?? []);
  return {
    ...injury,
    flags,
    penalty: penalty > 0 ? penalty : injury.penalty,
    penaltyStats: injury.penaltyStats ??
      locRow.stats?.map(String),
    bleed: bleed > 0 ? bleed : injury.bleed,
    dieRounds: dieRounds ?? injury.dieRounds,
  };
}

export function applyCritical(
  c: ISprawlChar,
  injury: ICriticalInjury,
): ISprawlChar {
  return {
    ...c,
    critical: enrichInjury(injury),
    resilience: 0,
  };
}

export function clearCritical(c: ISprawlChar): ISprawlChar {
  const next = { ...c };
  delete next.critical;
  return next;
}

/** Wound Glitch dice from crit / limb / street-tech / ICE. */
export function woundGlitch(c: ISprawlChar): number {
  let n = 0;
  if (c.critical) n++;
  if (c.critical?.flags?.includes("stun")) n++;
  if (c.limbFault?.glitch) n++;
  if ((c.streetTechQuirks ?? []).length > 0) n++;
  if ((c.pendingGlitch ?? 0) > 0) n += c.pendingGlitch!;
  return n;
}

/** Add sticky ICE glitch (persists until next roll consumes it). */
export function addPendingGlitch(
  c: ISprawlChar,
  n = 1,
): ISprawlChar {
  const add = Math.max(0, Math.floor(n));
  if (!add) return c;
  return {
    ...c,
    pendingGlitch: (c.pendingGlitch ?? 0) + add,
  };
}

/** Clear pending ICE glitch after it was applied to a roll. */
export function clearPendingGlitch(c: ISprawlChar): ISprawlChar {
  if (!c.pendingGlitch) return c;
  const next = { ...c };
  delete next.pendingGlitch;
  return next;
}

/** Flat stat penalty from critical location. */
export function criticalStatPenalty(
  c: ISprawlChar,
  stat: StatKey | string,
): { total: number; parts: string[] } {
  const crit = c.critical;
  if (!crit?.penalty || crit.penalty <= 0) {
    return { total: 0, parts: [] };
  }
  const stats = (crit.penaltyStats ?? []).map((s) =>
    s.toLowerCase()
  );
  const want = String(stat).toLowerCase();
  if (stats.length && !stats.includes(want)) {
    return { total: 0, parts: [] };
  }
  // No stats list → apply to all (harsh fatal)
  if (!stats.length && (crit.severity ?? 0) < 7) {
    return { total: 0, parts: [] };
  }
  const p = crit.penalty;
  return {
    total: -p,
    parts: [`crit ${crit.location} −${p}`],
  };
}

export function hasCritFlag(
  c: ISprawlChar,
  flag: string,
): boolean {
  return !!c.critical?.flags?.includes(flag);
}

/** Lines for +critical / sheet. */
export function formatCriticalStatus(
  crit: ICriticalInjury,
): string[] {
  const lines = [
    `  Severity ${crit.severity}` +
    ` (${crit.severityName}) · ${crit.location}`,
    `  ${crit.effect}`,
  ];
  const bits: string[] = [];
  if (!crit.flags || crit.flags.includes("glitch")) {
    bits.push("Glitch dice");
  }
  if (crit.penalty && crit.penalty > 0) {
    const st = (crit.penaltyStats ?? ["all"])
      .map((s) => s.slice(0, 3).toUpperCase())
      .join("/");
    bits.push(`−${crit.penalty} ${st}`);
  }
  if (crit.bleed && crit.bleed > 0) {
    bits.push(`bleed ${crit.bleed}/swing`);
  }
  if (crit.dieRounds != null) {
    bits.push(`DYING ${crit.dieRounds}rd`);
  }
  if (crit.flags?.includes("no-wield")) bits.push("no wield");
  if (crit.flags?.includes("no-run")) bits.push("no run");
  if (crit.flags?.includes("limb-out")) bits.push("limb out");
  if (crit.flags?.includes("blind")) bits.push("impaired sight");
  if (crit.flags?.includes("stun")) bits.push("stun+");
  if (bits.length) lines.push(`  [${bits.join(" · ")}]`);
  return lines;
}

/**
 * Tick bleed + dying clock (call on attack / scene tick).
 * Returns updated char + messages.
 */
export function tickCritical(
  c: ISprawlChar,
): { next: ISprawlChar; lines: string[]; dead: boolean } {
  const crit = c.critical;
  if (!crit) return { next: c, lines: [], dead: false };
  const lines: string[] = [];
  let next = c;
  let dead = false;

  if (crit.bleed && crit.bleed > 0 && next.resilience > 0) {
    next = clampRes(next, -crit.bleed);
    lines.push(
      `crit bleed −${crit.bleed} Res` +
        ` → ${next.resilience}/${next.resilienceMax}`,
    );
  }

  if (crit.dieRounds != null) {
    const left = crit.dieRounds - 1;
    if (left <= 0) {
      dead = true;
      next = {
        ...next,
        resilience: 0,
        critical: {
          ...crit,
          dieRounds: 0,
          effect: crit.effect + " — DEAD.",
          flags: [...(crit.flags ?? []), "dead"],
        },
      };
      lines.push("FATAL — down for good without medpro.");
    } else {
      next = {
        ...next,
        critical: { ...crit, dieRounds: left },
      };
      lines.push(`dying clock ${left} round(s) left`);
    }
  }

  return { next, lines, dead };
}

/**
 * Field stabilize: stop bleed + dying clock.
 * Keeps crit (Glitch, penalties, limb flags) until medpro.
 */
export function stabilizeCritical(
  c: ISprawlChar,
): { next: ISprawlChar; changed: boolean; note: string } {
  const crit = c.critical;
  if (!crit) {
    return {
      next: c,
      changed: false,
      note: "No critical to stabilize.",
    };
  }
  const bleeding = (crit.bleed ?? 0) > 0 ||
    !!crit.flags?.includes("bleed");
  const dying = crit.dieRounds != null ||
    !!crit.flags?.includes("dying");
  if (!bleeding && !dying) {
    return {
      next: c,
      changed: false,
      note: "Already stable (no bleed / dying clock).",
    };
  }
  const flags = (crit.flags ?? []).filter((f) =>
    f !== "dying" && f !== "bleed" && f !== "dead"
  );
  if (!flags.includes("glitch")) flags.push("glitch");
  if (!flags.includes("stabilized")) flags.push("stabilized");
  const baseFx = crit.effect
    .replace(/\s*—\s*DEAD\.?$/i, "")
    .replace(/\s*\(stabilized\)\s*$/i, "")
    .trim();
  const nextCrit: ICriticalInjury = {
    ...crit,
    bleed: undefined,
    dieRounds: undefined,
    flags,
    effect: `${baseFx} (stabilized)`,
  };
  return {
    next: { ...c, critical: nextCrit },
    changed: true,
    note: dying
      ? "Dying clock stopped; bleed packed."
      : "Bleed packed; patient stable enough to move.",
  };
}

/**
 * Force a fresh critical roll onto the sheet (Res 0 path).
 * Pass pre-rolled injury for shell table from caller.
 */
export function forceCriticalRoll(
  c: ISprawlChar,
  opts: {
    injury?: ICriticalInjury;
    rng?: () => number;
  } = {},
): { next: ISprawlChar; injury: ICriticalInjury } {
  const injury = opts.injury ??
    rollCritical(!!c.critical, opts.rng);
  const next = applyCritical(c, injury);
  return { next, injury: next.critical ?? injury };
}
