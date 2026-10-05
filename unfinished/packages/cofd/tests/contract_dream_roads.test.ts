// Contract effect hooks + Dream Roads / paradigm weaves.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  applyEffectHooks,
  applyHooksToTarget,
  parseEffectHooks,
} from "../src/form/contract_effects.ts";
import { hasCondition } from "../src/subsystems/conditions.ts";
import { hasTilt } from "../src/subsystems/tilts.ts";
import {
  addRoadLink,
  enterHorn,
  findLink,
  findWeave,
  parseDreamRoom,
  resolveWeave,
  travelRoad,
  WEAVE_CATALOG,
} from "../src/dream/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctl() {
  const s = defaultSheet();
  s.template = "changeling";
  s.powerStatValue = 2;
  s.moralityValue = 7;
  s.energyCurrent = 20;
  s.attributes.presence = 3;
  s.attributes.composure = 2;
  s.attributes.manipulation = 2;
  s.attributes.wits = 3;
  return s;
}

Deno.test("parseEffectHooks finds Shaken and Insensate", OPTS, () => {
  const h = parseEffectHooks(
    "inflicts the Shaken Condition and the Insensate Tilt",
  );
  assert(h.some((x) => x.key === "shaken"));
  assert(h.some((x) => x.key === "insensate"));
});

Deno.test("applyEffectHooks self Wanton", OPTS, () => {
  const text =
    "The target accepts a wreath and gains the Wanton Condition";
  // inflict style with no onTarget false path — apply to self for buffs
  const r = applyEffectHooks(ctl(), "gains the Inspired Condition", {
    successes: 2,
  });
  assert(r.applied.some((a) => a.key === "inspired"));
  assert(hasCondition(r.sheet, "inspired"));
});

Deno.test("applyHooksToTarget Blinded tilt", OPTS, () => {
  const text =
    "suffers the Blinded Tilt in both eyes";
  const r = applyHooksToTarget(ctl(), text, 3, "Murkblur");
  assert(hasTilt(r.sheet, "blinded"));
});

Deno.test("applyHooksToTarget zero successes no apply", OPTS, () => {
  const r = applyHooksToTarget(
    ctl(),
    "inflicts the Shaken Condition",
    0,
  );
  assertEquals(r.applied.length, 0);
});

Deno.test("weave catalog has paradigm entries", OPTS, () => {
  assert(WEAVE_CATALOG.some((w) => w.kind === "paradigm"));
  assert(findWeave("rewrite")?.kind === "paradigm");
  assert(findWeave("fright")?.applyCondition === "frightened");
});

Deno.test("resolveWeave fright applies condition", OPTS, () => {
  const sheet = ctl();
  const entered = enterHorn(sheet, {
    inHedge: true,
    successes: 2,
    roadRoomId: "road1",
    roadName: "Moon Path",
  });
  assert(entered.ok);
  const d = entered.sheet!.dreamState!;
  // Own roads weave on self
  const r = resolveWeave(
    entered.sheet!,
    { ...d, bastionOf: "self" },
    "fright",
    3,
  );
  assert(r.ok);
  assert(hasCondition(r.sheet!, "frightened"));
});

Deno.test("resolveWeave calm clears frightened", OPTS, () => {
  let sheet = ctl();
  sheet = {
    ...sheet,
    conditions: [{ key: "frightened" }],
    dreamState: {
      active: true,
      gate: "ivory",
      bastionOf: "self",
      fortification: 0,
      power: 2,
      finesse: 2,
      resistance: 2,
      dreamHealth: 10,
      dreamHealthMax: 10,
      weavesLeft: 5,
      enteredAt: 1,
    },
  };
  const r = resolveWeave(
    sheet,
    sheet.dreamState!,
    "calm",
    2,
  );
  assert(r.ok);
  assertEquals(hasCondition(r.sheet!, "frightened"), false);
});

Deno.test("road graph parse and travel", OPTS, () => {
  let node = parseDreamRoom({
    road: true,
    name: "Gate Node",
    links: [],
    createdAt: 1,
  });
  assert(node !== null);
  node = addRoadLink(node!, "roomB", "moon-arch");
  assertEquals(findLink(node, "moon-arch")?.to, "roomB");
  assertEquals(findLink(node, "roomB")?.label, "moon-arch");

  const sheet = ctl();
  const horn = enterHorn(sheet, {
    inHedge: true,
    successes: 2,
    roadRoomId: "roomA",
    roadName: "Gate Node",
  });
  assertEquals(horn.ok, true);
  const tr = travelRoad(horn.sheet!, {
    toRoomId: "roomB",
    label: "moon-arch",
    nodeName: "Silver Shore",
  });
  assertEquals(tr.ok, true);
  assertEquals(tr.dream!.roadRoomId, "roomB");
  assertStringIncludes(tr.dream!.roadPath!.join(","), "moon-arch");
});

Deno.test("paradigm rewrite needs high successes", OPTS, () => {
  const sheet = ctl();
  const d = {
    active: true as const,
    gate: "ivory" as const,
    bastionOf: "self",
    fortification: 0,
    power: 3,
    finesse: 2,
    resistance: 2,
    dreamHealth: 12,
    dreamHealthMax: 12,
    weavesLeft: 5,
    enteredAt: 1,
  };
  const fail = resolveWeave(sheet, d, "rewrite", 2);
  assertEquals(fail.ok, false);
  const ok = resolveWeave(
    { ...sheet, energyCurrent: 20 },
    d,
    "rewrite",
    6,
    "a carnival of moths",
  );
  assert(ok.ok);
});
