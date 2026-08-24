/**
 * Wilderness encounter tables + roll.
 */
import encJson from "../../resources/encounters.json" with {
  type: "json",
};
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";

export interface EncMobSpec {
  template: string;
  name: string;
  count: [number, number];
}

export interface EncBand {
  weight: number;
  label: string;
  mobs: EncMobSpec[];
  flavor?: string;
  xpBonus?: number;
}

export interface EncTable {
  slug: string;
  name: string;
  rooms: string[];
  chance: number;
  nothing?: string[];
  bands: EncBand[];
  book?: string;
}

export const ENCOUNTERS: Record<string, EncTable> =
  encJson as unknown as Record<string, EncTable>;

export function tableForWorldKey(
  roomKey: string,
): EncTable | undefined {
  const k = roomKey.toLowerCase();
  for (const t of Object.values(ENCOUNTERS)) {
    if (t.rooms.map((r) => r.toLowerCase()).includes(k)) {
      return t;
    }
  }
  // default wild
  return ENCOUNTERS.whisperwood;
}

export type TravelResult =
  | { kind: "nothing"; text: string }
  | { kind: "flavor"; text: string }
  | {
    kind: "fight";
    label: string;
    spawns: Array<{ template: string; name: string }>;
  };

function randInt(
  a: number,
  b: number,
  rng: () => number,
): number {
  return a + Math.floor(rng() * (b - a + 1));
}

function pickWeighted(
  bands: EncBand[],
  rng: () => number,
): EncBand {
  const total = bands.reduce((s, b) => s + (b.weight || 1), 0);
  let r = rng() * total;
  for (const b of bands) {
    r -= b.weight || 1;
    if (r <= 0) return b;
  }
  return bands[bands.length - 1]!;
}

export function rollTravel(
  table: EncTable,
  partySize = 1,
  rng: () => number = Math.random,
): TravelResult {
  if (rng() > table.chance) {
    const lines = table.nothing?.length
      ? table.nothing
      : ["The path is quiet."];
    return {
      kind: "nothing",
      text: lines[Math.floor(rng() * lines.length)]!,
    };
  }
  const band = pickWeighted(table.bands, rng);
  if (!band.mobs.length) {
    return {
      kind: "flavor",
      text: band.flavor || `You notice ${band.label}.`,
    };
  }
  const spawns: Array<{ template: string; name: string }> = [];
  const scale = 1 + Math.max(0, partySize - 1) * 0.35;
  for (const m of band.mobs) {
    const [lo, hi] = m.count;
    let n = randInt(lo, hi, rng);
    n = Math.max(1, Math.round(n * scale));
    n = Math.min(8, n);
    if (!NPC_TEMPLATES[m.template]) continue;
    for (let i = 0; i < n; i++) {
      const suffix = n > 1 ? ` ${i + 1}` : "";
      spawns.push({
        template: m.template,
        name: `${m.name}${suffix}`,
      });
    }
  }
  if (!spawns.length) {
    return {
      kind: "nothing",
      text: "Tracks, but nothing shows itself.",
    };
  }
  return { kind: "fight", label: band.label, spawns };
}
