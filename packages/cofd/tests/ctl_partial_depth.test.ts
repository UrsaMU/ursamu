// CtL partial-systems depth: harvest, bedlam pools, clash,
// loophole cost, spin paradigm, mantle trait, icons, frailty.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  applyHarvest,
  applyReap,
} from "../src/glamour/index.ts";
import {
  applyLoopholeCost,
  matchingSeemingClauses,
  parseContractCost,
} from "../src/form/contract_invoke.ts";
import { findContract } from "../src/dictionary/changeling.ts";
import {
  buildClashPools,
  resolveClashOutcome,
} from "../src/form/clash.ts";
import {
  acuteSensesBonus,
  mantleDots,
  ownMantle,
  pandemoniacalBonus,
} from "../src/form/mantle.ts";
import {
  frailtyActPenalty,
  parseFrailty,
} from "../src/form/frailty.ts";
import {
  hedgeContestPool,
  resolveSpin,
  listSpinEffects,
} from "../src/spin/index.ts";
import {
  addIcon,
  recoverIcon,
  spendIcon,
} from "../src/icon/index.ts";
import { parseRollExpression } from "../src/roller/index.ts";
import { lookupCondition } from "../src/subsystems/conditions.ts";
import { COFD_MERITS } from "../src/dictionary/merits.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlSheet() {
  const s = defaultSheet();
  s.template = "changeling";
  s.energyCurrent = 5;
  s.powerStatValue = 3;
  s.attributes.presence = 3;
  s.attributes.manipulation = 2;
  s.attributes.composure = 2;
  s.attributes.resolve = 2;
  s.attributes.wits = 3;
  s.skills.empathy = 2;
  s.skills.crafts = 2;
  s.customFields = { seeming: "Fairest", court: "spring" };
  s.merits = { "mantle:spring": 2, "acute senses": 1 };
  s.advantages = { willpowerMax: 5, willpowerCurrent: 4, size: 5 };
  return s;
}

Deno.test("applyHarvest gains Glamour per success", OPTS, () => {
  const r = applyHarvest(ctlSheet(), 3);
  assert(r.ok);
  assertEquals(r.gained, 3);
  assertEquals(r.sheet!.energyCurrent, 8);
});

Deno.test("applyHarvest rejects fae source", OPTS, () => {
  const r = applyHarvest(ctlSheet(), 2, { fromFae: true });
  assertEquals(r.ok, false);
});

Deno.test("applyReap fills Glamour and Ravages victim", OPTS, () => {
  const actor = ctlSheet();
  actor.energyCurrent = 2;
  const victim = defaultSheet();
  victim.template = "mortal";
  victim.advantages = {
    willpowerMax: 5,
    willpowerCurrent: 5,
    size: 5,
  };
  const r = applyReap(actor, victim);
  assert(r.ok);
  assertEquals(r.actorSheet!.energyCurrent >= 2, true);
  assert(r.gained >= 1 || r.actorSheet!.energyCurrent > 2);
  assertEquals(r.wpTaken, 3); // Wyrd 3
  assert(
    (r.victimSheet!.conditions ?? []).some((c) =>
      c.key === "ravaged"
    ),
  );
  assert(r.breakingPoint);
  assert(lookupCondition("ravaged"));
});

Deno.test("loophole waives Glamour only", OPTS, () => {
  const base = parseContractCost("2 Glamour + 1 Willpower");
  const free = applyLoopholeCost(base, true);
  assertEquals(free.glamour, 0);
  assertEquals(free.willpower, 1);
});

Deno.test("seeming clauses match Fairest", OPTS, () => {
  const c = findContract("Hostile Takeover");
  assert(c);
  const sc = matchingSeemingClauses(ctlSheet(), c!);
  assert(sc.some((x) => x.seeming === "Fairest"));
});

Deno.test("Mantle trait resolves in roll pool", OPTS, () => {
  const sheet = ctlSheet();
  const p = parseRollExpression("Presence+Mantle", sheet);
  assert(!p.error);
  assertEquals(p.pool, 3 + 2);
});

Deno.test("mantle helpers and acute senses", OPTS, () => {
  const s = ctlSheet();
  assertEquals(ownMantle(s), 2);
  assertEquals(mantleDots(s, "spring"), 2);
  assertEquals(acuteSensesBonus(s), 3);
  s.merits!.pandemoniacal = 2;
  assertEquals(pandemoniacalBonus(s), 2);
});

Deno.test("clash pools and outcome", OPTS, () => {
  const a = ctlSheet();
  const d = ctlSheet();
  d.powerStatValue = 1;
  const p = buildClashPools(a, d);
  assert(p.attackerPool > p.defenderPool);
  assertEquals(resolveClashOutcome(3, 1), "attacker");
  assertEquals(resolveClashOutcome(1, 1), "tie");
});

Deno.test("frailty parse taboo and major bane", OPTS, () => {
  const t = parseFrailty("taboo: never break bread with liars");
  assertEquals(t.kind, "taboo");
  assertEquals(frailtyActPenalty(t), 3);
  const b = parseFrailty("major bane: cold iron");
  assertEquals(b.kind, "bane");
  assert(b.major);
  assertEquals(frailtyActPenalty(b), 5);
});

Deno.test("spin catalog has paradigm effects", OPTS, () => {
  const list = listSpinEffects();
  assert(list.some((e) => e.kind === "paradigm"));
  assert(list.some((e) => e.slug === "danger-step"));
  assertEquals(hedgeContestPool("thorns"), 10);
  assertEquals(hedgeContestPool("trod"), 6);
});

Deno.test("resolveSpin paradigm contested by Hedge", OPTS, () => {
  const sheet = ctlSheet();
  sheet.energyCurrent = 10;
  const fail = resolveSpin(sheet, "goblin-fruit", {
    inHedge: true,
    successes: 4,
    danger: "hedge",
    hedgeRoll: () => 5,
  });
  assertEquals(fail.ok, false);
  assert(fail.hedgeContested);

  const ok = resolveSpin(sheet, "goblin-fruit", {
    inHedge: true,
    successes: 8,
    danger: "trod",
    hedgeRoll: () => 1,
  });
  assert(ok.ok);
  assertEquals(ok.fruitSlug, "common-fruit");
});

Deno.test("resolveSpin path still works (subtle)", OPTS, () => {
  const r = resolveSpin(ctlSheet(), "path", {
    inHedge: true,
    successes: 2,
    now: 1_000_000,
  });
  assert(r.ok);
  assertEquals(r.navBonusKey, "spinPath");
});

Deno.test("spendIcon clears Clarity condition", OPTS, () => {
  const sheet = ctlSheet();
  sheet.conditions = [{ key: "haunted" }];
  const a = addIcon(sheet, {
    name: "Old Song",
    kind: "memory",
    heldBy: "Keeper",
    description: "",
  });
  const r = spendIcon(a.sheet, a.icon.id);
  assert(r.ok);
  assert(
    !(r.sheet!.conditions ?? []).some((c) => c.key === "haunted"),
  );
});

Deno.test("recoverIcon awards Beat", OPTS, () => {
  const sheet = ctlSheet();
  sheet.beats = 0;
  const a = addIcon(sheet, {
    name: "Home Key",
    kind: "memory",
    heldBy: "Huntsman",
    description: "",
  });
  const r = recoverIcon(a.sheet, "Home Key");
  assert(r.ok);
  assertEquals((r.sheet!.beats ?? 0) >= 1, true);
});

Deno.test("changeling merits exist in catalog", OPTS, () => {
  const keys = new Set(COFD_MERITS.map((m) => m.key));
  for (const k of [
    "mantle",
    "court goodwill",
    "hollow",
    "stable trod",
    "acute senses",
    "pandemoniacal",
  ]) {
    assert(keys.has(k), `missing merit ${k}`);
  }
});

Deno.test("bedlam conditions in catalog", OPTS, () => {
  assert(lookupCondition("frightened"));
  assert(lookupCondition("lethargic"));
  assert(lookupCondition("ravaged"));
  assert(lookupCondition("wanton"));
  assert(lookupCondition("competitive"));
});
