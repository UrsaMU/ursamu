/**
 * P3: Ashford, caravans, events, rep unlocks.
 */
import { assert, assertEquals } from "@std/assert";
import ashford from "../resources/towns/ashford.json" with {
  type: "json",
};
import { validateWorldGraph } from "../src/world/seed.ts";
import {
  EXTRA_TOWNS,
  listCampaignTowns,
} from "../src/world/campaign.ts";
import {
  listRoutes,
  routeBySlug,
} from "../src/world/routes.ts";
import {
  advanceLeg,
  caravanBySlug,
  caravanComplete,
  listCaravans,
  progressLine,
  startRun,
} from "../src/world/caravans.ts";
import {
  EVENT_TABLES,
  rollEvent,
} from "../src/world/events.ts";
import {
  applyHireDiscount,
  bestUnlock,
  hireDiscountFromRep,
  titleFor,
} from "../src/world/unlocks.ts";
import { listBounties } from "../src/world/bounties.ts";
import { FACTIONS } from "../src/world/reputation.ts";
import type { TownDef } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function rngSeq(seeds: number[]): () => number {
  let i = 0;
  return () => {
    const v = seeds[i % seeds.length] ?? 0.5;
    i++;
    return v;
  };
}

Deno.test("ashford town graph valid", OPTS, () => {
  const t = ashford as TownDef;
  assertEquals(t.id, "ashford-v1");
  assertEquals(validateWorldGraph(t), []);
  assert(EXTRA_TOWNS.some((x) => x.id === "ashford-v1"));
  assert(listCampaignTowns().length >= 3);
});

Deno.test("haven-ash route + hills encounter", OPTS, () => {
  const r = routeBySlug("haven-ash")!;
  assertEquals(r.toTown, "ashford-v1");
  assertEquals(r.encounter, "hills");
  assert(r.legs.length >= 2);
  assert(listRoutes().length >= 2);
});

Deno.test("caravan legs progress to deliver", OPTS, () => {
  const def = caravanBySlug("flour-run")!;
  assert(def.legsRequired >= 2);
  let run = startRun(def.slug);
  assertEquals(caravanComplete(def, run), false);
  run = advanceLeg(run);
  run = advanceLeg(run);
  assert(caravanComplete(def, run));
  assert(progressLine(def, run).includes("2/2") ||
    progressLine(def, run).startsWith(
      `${def.legsRequired}/${def.legsRequired}`,
    ));
  assert(listCaravans().length >= 3);
});

Deno.test("events: flavor and fight bands", OPTS, () => {
  assert(EVENT_TABLES.town && EVENT_TABLES.road);
  // force first band picks via low weighted rolls
  const quiet = rollEvent("town", 1, () => 0.01);
  assert(quiet);
  assert(quiet.text.length > 0);
  // road table has fight bands — high weight walk may hit
  let fight = false;
  for (let i = 0; i < 40; i++) {
    const r = rollEvent("road", 2, () => (i * 0.03) % 1);
    if (r?.kind === "fight" && r.spawns.length) {
      fight = true;
      break;
    }
  }
  assert(fight, "expected a fight band on road table");
});

Deno.test("rep unlocks hire discount + titles", OPTS, () => {
  assertEquals(titleFor("havenbrook", 0), "Unknown");
  assertEquals(titleFor("havenbrook", 5), "Known Face");
  assertEquals(titleFor("havenbrook", 10), "Trusted Blade");
  assertEquals(titleFor("havenbrook", 25), "Town Hero");
  const u = bestUnlock("havenbrook", 10)!;
  assertEquals(u.hireDiscount, 0.1);
  const rep = { havenbrook: 10, millhaven: 0, ashford: 0 };
  assertEquals(hireDiscountFromRep(rep), 0.1);
  assertEquals(applyHireDiscount(25, rep), 22);
  assert(FACTIONS.ashford);
});

Deno.test("ashford bounties on board", OPTS, () => {
  const list = listBounties("ashford");
  assert(list.length >= 2);
  assert(list.some((b) => b.slug === "mine-skirmish"));
});

Deno.test("event rng deterministic nothing path", OPTS, () => {
  const r = rollEvent("wild", 1, rngSeq([0.0, 0.01]));
  assert(r);
});
