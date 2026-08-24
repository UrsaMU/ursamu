/**
 * Multi-town campaign seed: Havenbrook + Millhaven + roads.
 */
import millhavenJson from
  "../../resources/towns/millhaven.json" with { type: "json" };
import ashfordJson from
  "../../resources/towns/ashford.json" with { type: "json" };
import type { TownDef } from "./types.ts";
import {
  WORLD,
  listTownSeeds,
  seedStarterWorld,
  seedTown,
  type SeedResult,
} from "./seed.ts";
import {
  routeStatusLines,
  seedRoutes,
} from "./routes-seed.ts";

export const EXTRA_TOWNS: TownDef[] = [
  millhavenJson as TownDef,
  ashfordJson as TownDef,
];

export function listCampaignTowns(): TownDef[] {
  return [WORLD as TownDef, ...EXTRA_TOWNS];
}

export async function seedAllTowns(
  opts: { force?: boolean } = {},
): Promise<SeedResult[]> {
  const out: SeedResult[] = [];
  out.push(await seedStarterWorld(opts));
  for (const t of EXTRA_TOWNS) {
    out.push(await seedTown(t, opts));
  }
  return out;
}

export type CampaignSeedResult = {
  ok: boolean;
  message: string;
  towns: SeedResult[];
};

/** Full campaign: towns then roads. */
export async function seedCampaign(
  opts: { force?: boolean } = {},
): Promise<CampaignSeedResult> {
  const towns = await seedAllTowns(opts);
  const roads = await seedRoutes(opts);
  const failed = towns.filter((t) => !t.ok);
  const lines = [
    ...towns.map((t) => t.message),
    roads.message,
  ];
  return {
    ok: failed.length === 0 && roads.ok,
    message: lines.join(" | "),
    towns,
  };
}

export async function campaignStatus(): Promise<string[]> {
  const lines: string[] = [];
  const seeds = await listTownSeeds();
  for (const t of listCampaignTowns()) {
    const rec = seeds.find((s) =>
      s.worldId === t.id || s.id === t.id ||
      s.id === `town:${t.id}` ||
      (t.id === WORLD.id && s.id === "starter")
    );
    if (rec) {
      lines.push(
        `  ${t.name}: ${Object.keys(rec.rooms).length} rooms ` +
          `start=#${rec.playerStart ?? "?"}`,
      );
    } else {
      lines.push(`  ${t.name}: not seeded`);
    }
  }
  lines.push(...await routeStatusLines());
  return lines;
}

export { seedRoutes };
