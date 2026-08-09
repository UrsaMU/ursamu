/**
 * Caravan escort job catalog + progress pure helpers.
 */
import caravansJson from "../../resources/caravans.json" with {
  type: "json",
};

export interface CaravanDef {
  slug: string;
  name: string;
  summary: string;
  route: string;
  fromTown: string;
  toTown: string;
  fromRoom: string;
  toRoom: string;
  legsRequired: number;
  payGp: number;
  payXp: number;
  rep: number;
  faction: string;
  tier: number;
  encounterChance: number;
  book?: string;
}

export interface CaravanRun {
  slug: string;
  legsDone: number;
  startedAt: number;
  lastLegAt: number;
}

export const CARAVANS: Record<string, CaravanDef> =
  caravansJson as Record<string, CaravanDef>;

export function caravanBySlug(
  raw: string,
): CaravanDef | undefined {
  const t = raw.toLowerCase().trim();
  return CARAVANS[t] ??
    Object.values(CARAVANS).find((c) =>
      c.name.toLowerCase() === t
    );
}

export function listCaravans(): CaravanDef[] {
  return Object.values(CARAVANS).sort(
    (a, b) => a.tier - b.tier || a.name.localeCompare(b.name),
  );
}

export function startRun(slug: string): CaravanRun {
  const now = Date.now();
  return {
    slug,
    legsDone: 0,
    startedAt: now,
    lastLegAt: 0,
  };
}

export function advanceLeg(run: CaravanRun): CaravanRun {
  return {
    ...run,
    legsDone: run.legsDone + 1,
    lastLegAt: Date.now(),
  };
}

export function caravanComplete(
  def: CaravanDef,
  run: CaravanRun,
): boolean {
  return run.legsDone >= def.legsRequired;
}

export function progressLine(
  def: CaravanDef,
  run: CaravanRun | null,
): string {
  if (!run || run.slug !== def.slug) return "not taken";
  return `${run.legsDone}/${def.legsRequired} legs`;
}
