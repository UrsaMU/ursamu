/**
 * Random world events (town / road / wild).
 */
import eventsJson from "../../resources/events.json" with {
  type: "json",
};
import { NPC_TEMPLATES } from "../combat/npc-templates.ts";

export interface EventMob {
  template: string;
  name: string;
  count: [number, number];
}

export interface EventBand {
  weight: number;
  kind: "flavor" | "boon" | "risk" | "fight";
  text: string;
  gp?: number;
  gpLoss?: number;
  inspiration?: boolean;
  exhaustion?: number;
  hint?: string;
  mobs?: EventMob[];
}

export interface EventTable {
  slug: string;
  name: string;
  chance: number;
  bands: EventBand[];
}

export const EVENT_TABLES: Record<string, EventTable> =
  eventsJson as Record<string, EventTable>;

export type EventResult =
  | { kind: "flavor" | "boon" | "risk"; text: string; band: EventBand }
  | {
    kind: "fight";
    text: string;
    band: EventBand;
    spawns: Array<{ template: string; name: string }>;
  };

function pickWeighted(
  bands: EventBand[],
  rng: () => number,
): EventBand {
  const total = bands.reduce((s, b) => s + (b.weight || 1), 0);
  let r = rng() * total;
  for (const b of bands) {
    r -= b.weight || 1;
    if (r <= 0) return b;
  }
  return bands[bands.length - 1]!;
}

function randInt(a: number, b: number, rng: () => number): number {
  return a + Math.floor(rng() * (b - a + 1));
}

export function rollEvent(
  tableSlug: string,
  partySize = 1,
  rng: () => number = Math.random,
): EventResult | null {
  const table = EVENT_TABLES[tableSlug] ?? EVENT_TABLES.town;
  if (!table?.bands?.length) return null;
  if (rng() > (table.chance ?? 1)) {
    return {
      kind: "flavor",
      text: "Nothing of note.",
      band: { weight: 1, kind: "flavor", text: "Nothing of note." },
    };
  }
  const band = pickWeighted(table.bands, rng);
  if (band.kind === "fight" && band.mobs?.length) {
    const spawns: Array<{ template: string; name: string }> = [];
    const scale = 1 + Math.max(0, partySize - 1) * 0.3;
    for (const m of band.mobs) {
      if (!NPC_TEMPLATES[m.template]) continue;
      let n = randInt(m.count[0], m.count[1], rng);
      n = Math.max(1, Math.min(6, Math.round(n * scale)));
      for (let i = 0; i < n; i++) {
        const suffix = n > 1 ? ` ${i + 1}` : "";
        spawns.push({
          template: m.template,
          name: `${m.name}${suffix}`,
        });
      }
    }
    if (spawns.length) {
      return { kind: "fight", text: band.text, band, spawns };
    }
  }
  return {
    kind: band.kind === "fight" ? "flavor" : band.kind,
    text: band.text,
    band,
  };
}

export function listEventTables(): EventTable[] {
  return Object.values(EVENT_TABLES);
}
