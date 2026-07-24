// +shift / Mask / Chrysalis tests (CtL).

import { assertEquals, assert } from "@std/assert";
import {
  defaultSheet,
  migrateSheet,
  effectiveAttr,
  setTrait,
  validateTraitValue,
} from "../src/stats/index.ts";
import {
  applyMaskShift,
  applyAnimalShift,
  isChangelingSheet,
  maskFormList,
  maskStatusLine,
  formLookShortDesc,
  hasChrysalis,
  unlockedAnimals,
  findAnimal,
  contractExceptionalActive,
  restoreMaskAtSceneEnd,
  isMienActive,
  effectiveSpeed,
  animalPerceptionBonus,
  applyMienContractBoost,
  parseContractCost,
} from "../src/form/index.ts";
import { shiftExec } from "../src/commands/shift.ts";
import { contractExec } from "../src/commands/contract.ts";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { buildPool } from "../src/combat/pools.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function changelingSheet(
  over: Partial<ReturnType<typeof defaultSheet>> = {},
) {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  sheet.energyCurrent = 10;
  sheet.powerStatValue = 2;
  sheet.customFields = {
    seeming: "Beast",
    mask: "Soft coat.",
    mien: "Fox eyes.",
    animals: "wolf,hawk",
  };
  sheet.contracts = ["Chrysalis"];
  return { ...sheet, ...over };
}

Deno.test("effectiveAttr uses tempStats absolute override", OPTS, () => {
  const sheet = defaultSheet();
  sheet.attributes.strength = 2;
  sheet.tempStats = { strength: 4 };
  assertEquals(effectiveAttr(sheet, "strength"), 4);
});

Deno.test("buildPool respects tempStats strength", OPTS, () => {
  const sheet = defaultSheet();
  sheet.attributes.strength = 2;
  sheet.skills.brawl = 2;
  sheet.tempStats = { strength: 5 };
  const pool = buildPool(sheet, "unarmed", {}, 0, 0);
  assertEquals(pool.base, 7);
});

Deno.test("sheet/set mask and mien via setTrait", OPTS, () => {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  const v = validateTraitValue("mask", "A quiet barista.", sheet);
  assertEquals(v, "A quiet barista.");
  const next = setTrait(sheet, "mask", "A quiet barista.");
  assertEquals(next.customFields.mask, "A quiet barista.");
  const next2 = setTrait(next, "mien", "Glass antlers.");
  assertEquals(next2.customFields.mien, "Glass antlers.");
  next2.customFields.seeming = "Beast";
  const next3 = setTrait(next2, "animals", "wolf,fox");
  assertEquals(unlockedAnimals(next3), ["wolf", "fox"]);
});

Deno.test("animals field enforces slot count", OPTS, () => {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  sheet.customFields = { seeming: "Fairest" }; // 2 slots
  let err = "";
  try {
    setTrait(sheet, "animals", "wolf,hawk,fox");
  } catch (e) {
    err = (e as Error).message;
  }
  assert(err.includes("2") || err.includes("allows"));
});

Deno.test("animals field rejects unknown slug", OPTS, () => {
  const sheet = defaultSheet();
  sheet.template = "changeling";
  let err = "";
  try {
    setTrait(sheet, "animals", "direwolf");
  } catch (e) {
    err = (e as Error).message;
  }
  assert(err.toLowerCase().includes("unknown"));
});

Deno.test("applyMaskShift: drop mien spends Glamour + notes", OPTS, () => {
  const sheet = changelingSheet();
  const r = applyMaskShift(sheet, "mien", 1000);
  assertEquals(r.ok, true);
  assertEquals(r.sheet?.energyCurrent, 9);
  assertEquals(r.sheet?.formState?.current, "mien");
  assert(r.notes && r.notes.length >= 1);
  assertEquals(contractExceptionalActive(r.sheet!), true);
  assertEquals(isMienActive(r.sheet!), true);
});

Deno.test("applyMaskShift: raise mask from mien", OPTS, () => {
  const sheet = changelingSheet({
    formState: {
      system: "mask",
      current: "mien",
      since: 1,
      source: "core-mask",
    },
    energyCurrent: 3,
  });
  const r = applyMaskShift(sheet, "mask");
  assertEquals(r.ok, true);
  assertEquals(r.sheet?.formState?.current, "mask");
  assertEquals(r.sheet?.energyCurrent, 2);
  assertEquals(contractExceptionalActive(r.sheet!), false);
});

Deno.test("applyAnimalShift: wolf via Chrysalis", OPTS, () => {
  const sheet = changelingSheet();
  const r = applyAnimalShift(sheet, "wolf");
  assertEquals(r.ok, true);
  assertEquals(r.sheet?.formState?.system, "animal");
  assertEquals(r.sheet?.formState?.current, "wolf");
  assertEquals(r.sheet?.energyCurrent, 8);
  assertEquals(effectiveAttr(r.sheet!, "strength"), 3);
  assertEquals(effectiveAttr(r.sheet!, "dexterity"), 3);
  assertEquals(r.sheet?.tempStats?.size, 4);
  assertEquals(r.glamourSpent, 2);
});

Deno.test("applyAnimalShift: denied without Chrysalis", OPTS, () => {
  const sheet = changelingSheet({ contracts: [] });
  const r = applyAnimalShift(sheet, "wolf");
  assertEquals(r.ok, false);
  assert(r.reason?.includes("Chrysalis"));
});

Deno.test("applyAnimalShift: denied if not unlocked", OPTS, () => {
  const sheet = changelingSheet({
    customFields: {
      seeming: "Beast",
      animals: "hawk",
    },
  });
  const r = applyAnimalShift(sheet, "wolf");
  assertEquals(r.ok, false);
});

Deno.test("applyAnimalShift: leave human restores mask", OPTS, () => {
  const sheet = changelingSheet();
  const into = applyAnimalShift(sheet, "wolf");
  assert(into.sheet);
  const out = applyAnimalShift(into.sheet, "human");
  assertEquals(out.ok, true);
  assertEquals(out.sheet?.formState?.system, "mask");
  assertEquals(out.sheet?.formState?.current, "mask");
  assertEquals(out.sheet?.tempStats?.strength, undefined);
  assertEquals(out.glamourSpent, 0);
});

Deno.test("applyAnimalShift: leave preserves prior mien", OPTS, () => {
  const sheet = changelingSheet();
  const mien = applyMaskShift(sheet, "mien");
  assert(mien.sheet);
  const into = applyAnimalShift(mien.sheet, "wolf");
  assertEquals(into.sheet?.formState?.priorMask, "mien");
  const out = applyAnimalShift(into.sheet!, "human");
  assertEquals(out.sheet?.formState?.current, "mien");
});

Deno.test("restoreMaskAtSceneEnd free raise", OPTS, () => {
  const sheet = changelingSheet({
    formState: {
      system: "mask",
      current: "mien",
      since: 1,
      source: "core-mask",
    },
    energyCurrent: 5,
  });
  const r = restoreMaskAtSceneEnd(sheet);
  assert(r);
  assertEquals(r.formState?.current, "mask");
  assertEquals(r.energyCurrent, 5); // free
});

Deno.test("restoreMaskAtSceneEnd leaves animal", OPTS, () => {
  const sheet = changelingSheet();
  const into = applyAnimalShift(sheet, "wolf");
  const r = restoreMaskAtSceneEnd(into.sheet!);
  assert(r);
  assertEquals(r.formState?.current, "mask");
  assertEquals(r.tempStats?.strength, undefined);
});

Deno.test("formLookShortDesc flips with formState", OPTS, () => {
  const sheet = changelingSheet();
  assertEquals(formLookShortDesc(sheet), "Soft coat.");
  sheet.formState = { system: "mask", current: "mien" };
  assertEquals(formLookShortDesc(sheet), "Fox eyes.");
});

Deno.test("findAnimal + hasChrysalis", OPTS, () => {
  assertEquals(findAnimal("wolf")?.size, 4);
  assertEquals(hasChrysalis({ contracts: ["Chrysalis"] }), true);
  assertEquals(hasChrysalis({ contracts: [] }), false);
});

Deno.test("migrateSheet preserves formState priorMask", OPTS, () => {
  const s = migrateSheet({
    template: "changeling",
    formState: {
      system: "animal",
      current: "wolf",
      priorMask: "mien",
    },
  });
  assertEquals(s.formState?.priorMask, "mien");
});

Deno.test("+shift mien command persists sheet", OPTS, async () => {
  const sheet = changelingSheet();
  const me = mockPlayer({
    id: "shift1",
    name: "Pix",
    state: {
      cofd: sheet,
      attributes: [{ name: "short-desc", value: "Soft coat." }],
    },
  });
  const u = mockU({ me, args: ["", "mien"] });
  (u as { me: typeof me }).me = me;
  await shiftExec(u as never);
  const db = (u as { _dbCalls: unknown[][] })._dbCalls;
  const setCall = db.find((c) => c[1] === "$set") as
    | [string, string, Record<string, unknown>]
    | undefined;
  assert(setCall);
  const cofd = setCall[2]["data.cofd"] as typeof sheet | undefined;
  if (cofd) {
    assertEquals(cofd.formState?.current, "mien");
    assertEquals(cofd.energyCurrent, 9);
  }
});

Deno.test("+shift wolf command with Chrysalis", OPTS, async () => {
  const sheet = changelingSheet();
  const me = mockPlayer({
    id: "shift3",
    name: "Beast",
    state: { cofd: sheet },
  });
  const u = mockU({ me, args: ["", "wolf"] });
  (u as { me: typeof me }).me = me;
  await shiftExec(u as never);
  const db = (u as { _dbCalls: unknown[][] })._dbCalls;
  const cofdCall = db.find((c) => {
    const d = c[2] as Record<string, unknown>;
    return d && "data.cofd" in d;
  }) as [string, string, Record<string, unknown>] | undefined;
  assert(cofdCall);
  const cofd = cofdCall[2]["data.cofd"] as ReturnType<typeof defaultSheet>;
  assertEquals(cofd.formState?.system, "animal");
  assertEquals(cofd.formState?.current, "wolf");
  assertEquals(cofd.tempStats?.strength, 3);
});

Deno.test("+shift denied for mortal", OPTS, async () => {
  const sheet = defaultSheet();
  sheet.template = "mortal";
  const me = mockPlayer({ id: "shift2", state: { cofd: sheet } });
  const u = mockU({ me, args: ["", "mien"] });
  (u as { me: typeof me }).me = me;
  await shiftExec(u as never);
  const sent = (u as { _sent: string[] })._sent.join("\n");
  assert(sent.toLowerCase().includes("no form") || sent.includes("shift"));
});

Deno.test("+shift for NPC requires canEdit", OPTS, async () => {
  const sheet = changelingSheet();
  const npc = mockPlayer({
    id: "npc9",
    name: "Courtier",
    flags: new Set(["npc"]),
    state: { cofd: sheet },
  });
  const me = mockPlayer({
    id: "staff1",
    flags: new Set(["player", "connected", "builder"]),
    state: { cofd: defaultSheet() },
  });
  const u = mockU({
    me,
    args: ["", "mien for Courtier"],
    targetResult: npc,
    canEditResult: true,
  });
  (u as { me: typeof me }).me = me;
  await shiftExec(u as never);
  const db = (u as { _dbCalls: unknown[][] })._dbCalls;
  assert(db.some((c) => c[0] === "npc9"));
});

Deno.test("isChangelingSheet + maskFormList", OPTS, () => {
  const s = changelingSheet();
  assertEquals(isChangelingSheet(s), true);
  assertEquals(maskFormList().includes("mask"), true);
  assert(maskStatusLine(s).includes("mask"));
});

Deno.test("animal form sets speed tempStat", OPTS, () => {
  const sheet = changelingSheet();
  const r = applyAnimalShift(sheet, "wolf");
  assert(r.sheet);
  // wolf: Str3+Dex3+factor8 = 14
  assertEquals(r.sheet.tempStats?.speed, 14);
  assertEquals(effectiveSpeed(r.sheet), 14);
  assertEquals(animalPerceptionBonus(r.sheet), 2);
});

Deno.test("applyMienContractBoost floors at Wyrd", OPTS, () => {
  const sheet = changelingSheet({
    powerStatValue: 4,
    formState: {
      system: "mask",
      current: "mien",
      since: 1,
      source: "core-mask",
    },
  });
  const b = applyMienContractBoost(sheet, 2);
  assertEquals(b.exceptional, true);
  assertEquals(b.successes, 4);
  assertEquals(b.boosted, true);
});

Deno.test("parseContractCost", OPTS, () => {
  assertEquals(parseContractCost("2 Glamour").glamour, 2);
  assertEquals(
    parseContractCost("1 Glamour + 1 Willpower").willpower,
    1,
  );
  assertEquals(parseContractCost("None").glamour, 0);
});

Deno.test("+contract invoke spends Glamour", OPTS, async () => {
  const sheet = changelingSheet({
    contracts: ["Chrysalis"],
    energyCurrent: 10,
  });
  const me = mockPlayer({
    id: "ctr1",
    name: "Pix",
    state: { cofd: sheet },
  });
  const u = mockU({ me, args: ["", "Chrysalis"] });
  (u as { me: typeof me }).me = me;
  await contractExec(u as never);
  const sent = (u as { _sent: string[] })._sent.join("\n");
  assert(sent.includes("Chrysalis") || sent.includes("invoke"));
  const db = (u as { _dbCalls: unknown[][] })._dbCalls;
  const cofdCall = db.find((c) => {
    const d = c[2] as Record<string, unknown>;
    return d && "data.cofd" in d;
  }) as [string, string, Record<string, unknown>] | undefined;
  assert(cofdCall);
  const cofd = cofdCall[2]["data.cofd"] as ReturnType<
    typeof defaultSheet
  >;
  // Chrysalis costs 2 Glamour
  assertEquals(cofd.energyCurrent, 8);
});
