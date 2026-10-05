// Hollow polish, Mantle high-dot, hobgoblin build.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  hiddenEntryActive,
  hiddenEntryPenalty,
  queueShadowFruit,
  readyShadowFruit,
} from "../src/hedge/hollow_effects.ts";
import type { HedgeRoom } from "../src/hedge/types.ts";
import {
  mantleAggravatedDefend,
  mantleContractGlamourDiscount,
  mantleConvertClarity,
  mantleProtectorArmor,
  mantleWipeDebt,
  mantleWinterWoundBonus,
} from "../src/form/mantle_high.ts";
import {
  buildHobgoblinSheet,
  isHobgoblinSheet,
  readHobPowers,
} from "../src/hobgoblin/index.ts";
import { addCondition } from "../src/subsystems/conditions.ts";
import { getNpcTemplate } from "../src/npc/catalog.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import { addDebt, openDebts } from "../src/market/debt.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function hollowRoom(
  owners: string[],
  enh: string[],
): HedgeRoom {
  return {
    realm: "hollow",
    danger: "hedge",
    hollow: {
      owners,
      rating: 5,
      enhancements: enh,
    },
  };
}

function ctl(court: string, mantle: number) {
  const s = defaultSheet();
  s.template = "changeling";
  s.customFields = { court };
  s.merits = { [`mantle:${court}`]: mantle };
  s.powerStatValue = 3;
  s.moralityValue = 5;
  s.energyCurrent = 15;
  s.conditions = [];
  return s;
}

Deno.test("hidden entry active when all owners inside", OPTS, () => {
  const room = hollowRoom(["a", "b"], ["hidden-entry"]);
  assertEquals(hiddenEntryActive(room, ["a", "b", "x"]), true);
  assertEquals(hiddenEntryPenalty(room, ["a", "b"]), 2);
  assertEquals(hiddenEntryActive(room, ["a"]), false);
  assertEquals(hiddenEntryPenalty(room, ["a"]), 0);
});

Deno.test("shadow garden queues and ripens", OPTS, () => {
  const room = hollowRoom(["a"], ["shadow-garden"]);
  const q = queueShadowFruit(room, "amaranthine", 1000);
  assert(q);
  const early = readyShadowFruit(q!, 2000);
  assertEquals(early.ready.length, 0);
  const late = readyShadowFruit(q!, 1000 + 3600_000 + 1);
  assertEquals(late.ready.length, 1);
  assertEquals(late.ready[0].slug, "amaranthine");
});

Deno.test("mantle protector armor summer 3+", OPTS, () => {
  assertEquals(mantleProtectorArmor(ctl("summer", 3)), 3);
  assertEquals(mantleProtectorArmor(ctl("summer", 2)), 0);
  assertEquals(mantleProtectorArmor(ctl("spring", 5)), 0);
});

Deno.test("mantle aggravated defend summer 5", OPTS, () => {
  assert(mantleAggravatedDefend(ctl("summer", 5), true));
  assertEquals(mantleAggravatedDefend(ctl("summer", 5), false), false);
  assertEquals(mantleAggravatedDefend(ctl("summer", 4), true), false);
});

Deno.test("mantle contract discount autumn 3 vs fae", OPTS, () => {
  assertEquals(
    mantleContractGlamourDiscount(ctl("autumn", 3), true),
    1,
  );
  assertEquals(
    mantleContractGlamourDiscount(ctl("autumn", 3), false),
    0,
  );
});

Deno.test("mantle wipe debt autumn 4", OPTS, () => {
  let s = ctl("autumn", 4);
  s = addDebt(s, { to: "Goblin", amount: 3, note: "test" }).sheet;
  assertEquals(openDebts(s).length, 1);
  const r = mantleWipeDebt(s, 1_000_000);
  assert(r.ok);
  assertEquals(r.reduced, 3);
});

Deno.test("mantle convert clarity spring 5", OPTS, () => {
  let s = ctl("spring", 5);
  s = addCondition(s, "haunted");
  const r = mantleConvertClarity(s, 1_000_000);
  assert(r.ok);
  assertStringIncludes(r.lines.join(" "), "Inspired");
  assertEquals(r.sheet!.moralityValue, 6);
});

Deno.test("mantle winter wound bonus", OPTS, () => {
  const s = ctl("winter", 5);
  s.health = { bashing: 0, lethal: 2, aggravated: 1 };
  const w = mantleWinterWoundBonus(s);
  assert(w.ignoreWoundPenalty);
  assertEquals(w.physicalBonus, 3);
});

Deno.test("buildHobgoblinSheet merchant", OPTS, () => {
  const h = buildHobgoblinSheet({
    name: "Needlegrin",
    concept: "merchant",
    wyrd: 3,
  });
  assert(isHobgoblinSheet(h));
  assertEquals(h.powerStatValue, 3);
  assert(readHobPowers(h).includes("innocuous"));
  assert((h.frailties ?? []).length >= 1);
});

Deno.test("hobgoblin template and npc", OPTS, () => {
  assert(COFD_TEMPLATES.hobgoblin);
  const npc = getNpcTemplate("hobgoblin-trader");
  assert(npc);
  assertEquals(npc!.lineage, "hobgoblin");
});
