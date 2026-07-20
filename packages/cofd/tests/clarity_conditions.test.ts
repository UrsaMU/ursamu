// CtL Clarity breakpoint Conditions on Integrity loss.

import { assert, assertEquals } from "@std/assert";
import {
  applyBreakingPoint,
  clarityConditionForRating,
  rollBreakingPoint,
  type BreakingPointResult,
} from "../src/integrity/engine.ts";
import { hasCondition } from "../src/subsystems/conditions.ts";
import { lookupCondition } from "../src/subsystems/conditions.ts";
import {
  defaultSheet,
  refreshAdvantages,
} from "../src/stats/index.ts";
import type { RollResult } from "../src/roller/execute.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function fakeRoll(opts: Partial<RollResult>): RollResult {
  return {
    successes: 0,
    rolls: [],
    exceptional: false,
    dramaticFailure: false,
    isChanceDie: false,
    again: 10,
    rote: false,
    ...opts,
  };
}

function failResult(sheet: ReturnType<typeof defaultSheet>): BreakingPointResult {
  return rollBreakingPoint(
    {
      integrity: sheet.moralityValue,
      resolve: sheet.attributes.resolve | 0,
      composure: sheet.attributes.composure | 0,
    },
    sheet,
    fakeRoll({ successes: 0, rolls: [2, 3, 4] }),
  );
}

Deno.test("clarityConditionForRating maps breakpoints", OPTS, () => {
  assertEquals(clarityConditionForRating(7), "haunted");
  assertEquals(clarityConditionForRating(6), "the-boneyard");
  assertEquals(clarityConditionForRating(5), "delusional-ctl");
  assertEquals(clarityConditionForRating(4), "isolated");
  assertEquals(clarityConditionForRating(3), "unstable");
  assertEquals(clarityConditionForRating(2), "waking-nightmare");
  assertEquals(clarityConditionForRating(1), "dream-eaten");
  assertEquals(clarityConditionForRating(8), null);
  assertEquals(clarityConditionForRating(0), null);
});

Deno.test("catalog has CtL Clarity Conditions", OPTS, () => {
  for (
    const key of [
      "haunted",
      "the-boneyard",
      "delusional-ctl",
      "harvest-boon",
      "isolated",
      "unstable",
      "waking-nightmare",
      "dream-eaten",
    ]
  ) {
    const e = lookupCondition(key);
    assert(e, `missing catalog key ${key}`);
    assertEquals(e.category, "condition");
  }
  // delusional-ctl must not collide with core delusional
  assert(lookupCondition("delusional"));
  assert(lookupCondition("delusional-ctl"));
  assertEquals(
    lookupCondition("delusional")!.name,
    "Delusional",
  );
  assertEquals(
    lookupCondition("delusional-ctl")!.name,
    "Delusional (Clarity)",
  );
});

Deno.test(
  "changeling breaking point at Clarity 7 applies haunted",
  OPTS,
  () => {
    const s = refreshAdvantages(defaultSheet());
    s.template = "changeling";
    s.moralityValue = 8; // loss → 7
    s.attributes.resolve = 3;
    s.attributes.composure = 3;
    const r = failResult(s);
    assertEquals(r.integrityLoss, 1);
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 7);
    assert(hasCondition(out, "haunted"));
  },
);

Deno.test(
  "changeling Clarity 5 loss applies delusional-ctl",
  OPTS,
  () => {
    const s = refreshAdvantages(defaultSheet());
    s.template = "changeling";
    s.moralityValue = 6; // loss → 5
    const r = failResult(s);
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 5);
    assert(hasCondition(out, "delusional-ctl"));
    assert(!hasCondition(out, "delusional"));
  },
);

Deno.test(
  "changeling Clarity 1 loss applies dream-eaten",
  OPTS,
  () => {
    const s = refreshAdvantages(defaultSheet());
    s.template = "changeling";
    s.moralityValue = 2;
    const r = failResult(s);
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 1);
    assert(hasCondition(out, "dream-eaten"));
  },
);

Deno.test(
  "mortal breaking point does not apply Clarity Conditions",
  OPTS,
  () => {
    const s = refreshAdvantages(defaultSheet());
    s.template = "mortal";
    s.moralityValue = 8;
    const r = failResult(s);
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 7);
    assert(!hasCondition(out, "haunted"));
  },
);

Deno.test(
  "success (no integrity loss) skips Clarity Condition",
  OPTS,
  () => {
    const s = refreshAdvantages(defaultSheet());
    s.template = "changeling";
    s.moralityValue = 7;
    const r = rollBreakingPoint(
      {
        integrity: 7,
        resolve: 3,
        composure: 3,
      },
      s,
      fakeRoll({ successes: 2, rolls: [8, 9, 2] }),
    );
    assertEquals(r.integrityLoss, 0);
    const out = applyBreakingPoint(s, r);
    assertEquals(out.moralityValue, 7);
    assert(!hasCondition(out, "haunted"));
  },
);
