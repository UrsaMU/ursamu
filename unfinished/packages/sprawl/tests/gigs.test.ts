import { assert, assertEquals } from "@std/assert";
import {
  applyGigComplete,
  formatGigCard,
  nodesForTier,
  rewardsForGig,
  rollGig,
} from "../engine/gigs.ts";
import {
  isBossNode,
  nodeReadyToAdvance,
  onGigMinionKilled,
  pushGigNode,
} from "../engine/gig-run.ts";
import { siteDesc } from "../engine/gig-site.ts";
import { GIG_SYSTEMS } from "../engine/catalog.ts";
import { defaultChar } from "../db/schemas.ts";
import {
  GIG_COMPLICATIONS,
  GIG_CONTRACTS,
  GIG_MINIONS,
  GIG_ROOMS,
  GIG_TARGETS,
  GIG_VENUES,
} from "../engine/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("gig tables are full d66 (36)", OPTS, () => {
  assertEquals(GIG_CONTRACTS.length, 36);
  assertEquals(GIG_VENUES.length, 36);
  assertEquals(GIG_TARGETS.length, 36);
  assertEquals(GIG_ROOMS.length, 36);
  assertEquals(GIG_MINIONS.length, 36);
  assertEquals(GIG_COMPLICATIONS.length, 36);
  assertEquals(GIG_SYSTEMS.length, 36);
});

Deno.test("rollGig has nodes and room", OPTS, () => {
  let i = 0;
  const rng = () => {
    i = (i % 6) + 1;
    return i;
  };
  const g = rollGig(rng);
  assert(g.id.length > 4);
  assert(g.title.length > 0);
  assert(g.bossDs >= 1);
  assert(g.targetName.length > 0);
  assertEquals(g.status, "active");
  assertEquals(g.node, 1);
  assert((g.nodesMax ?? 0) >= 2);
  assert(g.roomName);
  assert(g.roomDesc && g.roomDesc.length > 80);
  assertEquals(g.nodesMax, nodesForTier(g.tier));
  const card = formatGigCard(g).join("\n");
  assert(card.includes(g.title));
  assert(card.includes("Node"));
});

Deno.test("pushGigNode advances after clear", OPTS, () => {
  const g = rollGig(() => 3);
  g.nodeCleared = true;
  g.minionObjIds = [];
  const r = pushGigNode(g, () => 2);
  assertEquals(r.gig.node, 2);
  assert(r.gig.roomName);
  assert(r.gig.roomDesc && r.gig.roomDesc.length > 80);
  assertEquals(r.gig.nodeCleared, false);
});

Deno.test("siteDesc is multi-paragraph look prose", OPTS, () => {
  const g = rollGig(() => 2);
  const d = siteDesc(g);
  assert(d.length > 200);
  assert(d.includes(g.title));
  assert(d.includes("\r\n\r\n") || d.includes("\n\n"));
  // Full room text, not just one-liner tag
  assert(
    (g.roomDesc && d.includes(g.roomDesc.slice(0, 40))) ||
      (g.roomBlurb && d.includes(g.roomBlurb)),
  );
});

Deno.test("every gig room has full description", OPTS, () => {
  for (const r of GIG_ROOMS) {
    const desc = String(r.description ?? "");
    assert(
      desc.length >= 200,
      `${r.slug} description too short (${desc.length})`,
    );
  }
  for (const v of GIG_VENUES) {
    const desc = String(v.description ?? v.blurb ?? "");
    assert(
      desc.length >= 80,
      `${v.slug} venue desc too short`,
    );
  }
});

Deno.test("onGigMinionKilled clears node", OPTS, () => {
  const c = defaultChar("Runner");
  const g = rollGig(() => 1);
  g.minionObjIds = ["a", "b"];
  c.activeGig = g;
  const one = onGigMinionKilled(c, "a");
  assertEquals(one.next.activeGig?.minionObjIds?.length, 1);
  assertEquals(one.cleared, false);
  const two = onGigMinionKilled(one.next, "b");
  assert(two.cleared);
  assertEquals(two.next.activeGig?.nodeCleared, true);
});

Deno.test("isBossNode on final", OPTS, () => {
  const g = rollGig(() => 4);
  g.node = g.nodesMax;
  assert(isBossNode(g));
  g.node = 1;
  if ((g.nodesMax ?? 1) > 1) assert(!isBossNode(g));
});

Deno.test("hack-node final needs primary hack", OPTS, () => {
  const g = rollGig(() => 2);
  g.objective = "hack-node";
  g.node = g.nodesMax;
  g.hackDs = 14;
  g.nodeCleared = true;
  g.minionObjIds = [];
  const blocked = nodeReadyToAdvance(g);
  assert(!blocked.ok);
  g.primaryHacked = true;
  assert(nodeReadyToAdvance(g).ok);
});

Deno.test("applyGigComplete pays and clears", OPTS, () => {
  const c = defaultChar("Runner");
  c.chargenComplete = true;
  c.bityuan = 100;
  c.ap = 10;
  const gig = rollGig(() => 2);
  c.activeGig = gig;
  const rw = rewardsForGig(gig);
  const { next, reward } = applyGigComplete(c, gig);
  assertEquals(reward.bityuan, rw.bityuan);
  assertEquals(next.bityuan, 100 + rw.bityuan);
  assertEquals(next.ap, 10 + rw.ap);
  assertEquals(next.apTotal, rw.ap);
  assertEquals(next.activeGig, undefined);
});
