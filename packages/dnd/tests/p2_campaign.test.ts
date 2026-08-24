/**
 * P2: multi-town, routes, bounties, reputation.
 */
import { assert, assertEquals } from "@std/assert";
import millhaven from "../resources/towns/millhaven.json" with {
  type: "json",
};
import {
  validateWorldGraph,
  WORLD,
} from "../src/world/seed.ts";
import {
  EXTRA_TOWNS,
  listCampaignTowns,
} from "../src/world/campaign.ts";
import {
  listRoutes,
  routeBySlug,
} from "../src/world/routes.ts";
import {
  BOUNTIES,
  bountyBySlug,
  bountyComplete,
  emptyProgress,
  listBounties,
  noteDelve,
  noteKill,
  progressLine,
} from "../src/world/bounties.ts";
import {
  addRep,
  applyPriceDiscount,
  FACTIONS,
  formatRepLine,
  readRep,
  repDiscount,
} from "../src/world/reputation.ts";
import type { TownDef } from "../src/world/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("millhaven town graph valid", OPTS, () => {
  const t = millhaven as TownDef;
  assertEquals(t.id, "millhaven-v1");
  const errs = validateWorldGraph(t);
  assertEquals(errs, [], errs.join("; "));
  assert(t.rooms.some((r) => r.key === "square"));
  assert(t.vendors && t.vendors.length >= 1);
});

Deno.test("campaign lists havenbrook + millhaven", OPTS, () => {
  const towns = listCampaignTowns();
  assert(towns.some((t) => t.id === WORLD.id));
  assert(EXTRA_TOWNS.some((t) => t.id === "millhaven-v1"));
  assert(towns.length >= 2);
});

Deno.test("routes link towns with legs", OPTS, () => {
  const routes = listRoutes();
  assert(routes.length >= 2);
  const r = routeBySlug("haven-mill")!;
  assertEquals(r.fromTown, "havenbrook-v1");
  assertEquals(r.toTown, "millhaven-v1");
  assert(r.legs.length >= 2);
  assert(r.encounter);
});

Deno.test("bounties: kills progress + complete", OPTS, () => {
  const def = bountyBySlug("goblin-raid")!;
  assertEquals(def.goal.kind, "kills");
  let p = emptyProgress(def.slug);
  assertEquals(bountyComplete(def, p), false);
  p = noteKill(p, "goblin");
  p = noteKill(p, "goblin");
  p = noteKill(p, "goblin");
  assert(bountyComplete(def, p));
  assert(progressLine(def, p).includes("3/3"));
});

Deno.test("bounties: delve goal", OPTS, () => {
  const def = bountyBySlug("clear-warren")!;
  assertEquals(def.goal.kind, "delve");
  let p = emptyProgress(def.slug);
  assertEquals(bountyComplete(def, p), false);
  p = noteDelve(p, "goblin-warren");
  assert(bountyComplete(def, p));
});

Deno.test("bounties boards filter", OPTS, () => {
  assert(listBounties("havenbrook").length >= 2);
  assert(listBounties("millhaven").length >= 1);
  assert(Object.keys(BOUNTIES).length >= 4);
});

Deno.test("reputation discounts", OPTS, () => {
  assertEquals(repDiscount(0), 0);
  assertEquals(repDiscount(5), 0.05);
  assertEquals(repDiscount(10), 0.1);
  assertEquals(repDiscount(25), 0.2);
  assertEquals(applyPriceDiscount(100, 10), 90);
  assertEquals(applyPriceDiscount(100, 25), 80);
  assertEquals(applyPriceDiscount(1, 25), 1);
  let rep = readRep({});
  rep = addRep(rep, "havenbrook", 3);
  rep = addRep(rep, "havenbrook", 2);
  assertEquals(rep.havenbrook, 5);
  assert(formatRepLine(rep).includes("Havenbrook"));
  assert(FACTIONS.millhaven);
});

Deno.test("havenbrook graph still valid", OPTS, () => {
  const errs = validateWorldGraph(WORLD);
  assertEquals(errs, [], errs.join("; "));
});
