/**
 * Faction reputation on player state.dndRep.
 */
import factionsJson from "../../resources/factions.json" with {
  type: "json",
};

export interface FactionDef {
  slug: string;
  name: string;
  summary?: string;
  book?: string;
}

export const FACTIONS: Record<string, FactionDef> =
  factionsJson as Record<string, FactionDef>;

export type RepMap = Record<string, number>;

export function readRep(
  // deno-lint-ignore no-explicit-any
  state: any,
): RepMap {
  const raw = state?.dndRep;
  if (!raw || typeof raw !== "object") return {};
  const out: RepMap = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Number(v);
    if (!isNaN(n)) out[k.toLowerCase()] = n;
  }
  return out;
}

export function addRep(
  rep: RepMap,
  faction: string,
  delta: number,
): RepMap {
  const key = faction.toLowerCase().trim();
  if (!key || !delta) return { ...rep };
  const next = { ...rep };
  next[key] = Math.max(-50, Math.min(100, (next[key] ?? 0) + delta));
  return next;
}

/** Shop discount fraction 0–0.25 from faction standing. */
export function repDiscount(rep: number): number {
  if (rep >= 25) return 0.2;
  if (rep >= 10) return 0.1;
  if (rep >= 5) return 0.05;
  return 0;
}

export function applyPriceDiscount(
  price: number,
  rep: number,
): number {
  const d = repDiscount(rep);
  if (d <= 0) return Math.max(1, Math.floor(price));
  return Math.max(1, Math.floor(price * (1 - d)));
}

export function formatRepLine(rep: RepMap): string {
  const keys = Object.keys(FACTIONS);
  if (!keys.length) return "(no factions)";
  return keys
    .map((k) => {
      const n = rep[k] ?? 0;
      const name = FACTIONS[k]?.name ?? k;
      return `${name} ${n >= 0 ? "+" : ""}${n}`;
    })
    .join(" · ");
}


