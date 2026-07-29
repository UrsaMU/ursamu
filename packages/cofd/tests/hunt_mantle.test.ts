// Wild Hunt + Mantle seasonal bonus tests.

import {
  assert,
  assertEquals,
  assertStringIncludes,
} from "@std/assert";
import { defaultSheet } from "../src/stats/index.ts";
import {
  applyTrackResult,
  endHunt,
  initHuntsmanSheet,
  isHuntsmanSheet,
  readHunterState,
  readQuarryHunt,
  stageFromProgress,
  startHunt,
  trackPoolBonus,
  activateHuntsmanPower,
  findHuntsmanPower,
  defaultHuntsmanPowers,
} from "../src/huntsman/index.ts";
import {
  mantleRollBonus,
  ownMantle,
} from "../src/form/index.ts";
import { getNpcTemplate } from "../src/npc/catalog.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import { getDreadPower } from "../src/npc/dread.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctl(court = "spring", mantle = 2) {
  const s = defaultSheet();
  s.template = "changeling";
  s.powerStatValue = 2;
  s.energyCurrent = 10;
  s.customFields = {
    court,
    needle: "Protector",
    thread: "Friendship",
  };
  s.merits = { [`mantle:${court}`]: mantle };
  s.attributes.presence = 3;
  s.attributes.wits = 3;
  s.skills.persuasion = 2;
  s.skills.intimidation = 2;
  s.skills.stealth = 2;
  s.skills.subterfuge = 2;
  s.skills.occult = 2;
  s.skills.survival = 2;
  return s;
}

Deno.test("stageFromProgress thresholds", OPTS, () => {
  assertEquals(stageFromProgress(1), "scent");
  assertEquals(stageFromProgress(4), "trail");
  assertEquals(stageFromProgress(7), "closing");
  assertEquals(stageFromProgress(10), "cornered");
});

Deno.test("startHunt and track advance", OPTS, () => {
  const q = ctl();
  const h = initHuntsmanSheet(defaultSheet());
  assert(isHuntsmanSheet(h));
  const pair = startHunt(q, h, {
    hunterId: "h1",
    hunterName: "Verderer",
    quarryId: "q1",
    quarryName: "Alice",
  });
  assert(readQuarryHunt(pair.quarry)?.active);
  assertEquals(readHunterState(pair.hunter)?.quarryName, "Alice");

  const tr = applyTrackResult(pair.quarry, pair.hunter, 3, {
    maskDown: true,
  });
  assert(tr.ok);
  assertEquals(tr.quarry!.huntState!.progress >= 5, true);
  assertStringIncludes(tr.lines.join(" "), "trail");
});

Deno.test("endHunt clears quarry", OPTS, () => {
  const q = ctl();
  const h = initHuntsmanSheet(defaultSheet());
  const pair = startHunt(q, h, {
    hunterId: "h1",
    hunterName: "V",
    quarryId: "q1",
    quarryName: "A",
  });
  const ended = endHunt(pair.quarry, pair.hunter);
  assertEquals(readQuarryHunt(ended.quarry), null);
});

Deno.test("trackPoolBonus mask down", OPTS, () => {
  assertEquals(trackPoolBonus(3, 4, false), 0);
  assertEquals(trackPoolBonus(3, 4, true), 4);
});

Deno.test("huntsman powers catalog and activate", OPTS, () => {
  assert(findHuntsmanPower("kindred-spirits"));
  assert(defaultHuntsmanPowers(4).includes("kindred-spirits"));
  const h = initHuntsmanSheet(defaultSheet());
  h.energyCurrent = 10;
  const r = activateHuntsmanPower(h, "among-the-sheep");
  assert(r.ok);
  assertEquals(r.sheet!.energyCurrent, 8);
});

Deno.test("mantle spring seduce bonus", OPTS, () => {
  const s = ctl("spring", 3);
  const r = mantleRollBonus(s, "Presence+Persuasion");
  assertEquals(r.bonus, 3);
  assertStringIncludes(r.label, "Spring");
});

Deno.test("mantle summer intimidate", OPTS, () => {
  const s = ctl("summer", 2);
  const r = mantleRollBonus(s, "Presence+Intimidation");
  assertEquals(r.bonus, 2);
});

Deno.test("mantle autumn occult", OPTS, () => {
  const s = ctl("autumn", 1);
  const r = mantleRollBonus(s, "Intelligence+Occult");
  assertEquals(r.bonus, 1);
});

Deno.test("mantle winter stealth", OPTS, () => {
  const s = ctl("winter", 2);
  const r = mantleRollBonus(s, "Dexterity+Stealth", {
    spying: true,
  });
  assertEquals(r.bonus, 2);
  const lie = mantleRollBonus(s, "Manipulation+Subterfuge");
  assertEquals(lie.bonus, 2);
});

Deno.test("mantle no bonus without dots", OPTS, () => {
  const s = ctl("spring", 0);
  s.merits = {};
  assertEquals(ownMantle(s), 0);
  assertEquals(mantleRollBonus(s, "Presence+Persuasion").bonus, 0);
});

Deno.test("templates and npc load", OPTS, () => {
  assert(COFD_TEMPLATES.huntsman);
  assertEquals(COFD_TEMPLATES.huntsman.powerStatName, "Wyrd");
  const npc = getNpcTemplate("huntsman");
  assert(npc);
  assertEquals(npc!.lineage, "huntsman");
  assert(getDreadPower("kindred-spirits"));
  assert(getDreadPower("among-the-sheep"));
});
