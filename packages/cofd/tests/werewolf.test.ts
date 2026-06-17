import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { defaultSheet, setTrait, validateTraitValue } from "../cofd.ts";
import { werewolfSection } from "../src/sheet/sections/werewolf.ts";
import type { SheetContext } from "../src/sheet/sections/types.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import { renderCgList } from "../src/chargen/list.ts";
import { renderInfo } from "../src/info/index.ts";
import {
  WTF_AUSPICES,
  WTF_TRIBES,
  WTF_RENOWN,
  WTF_GIFTS,
  WTF_RITES,
  findAuspice,
  findTribe,
  giftsByType,
} from "../src/dictionary/index.ts";
import {
  startingMeritDots,
  startingPowerDots,
  powerLabel,
  resolveCustomFieldValue,
  maxStageFor,
  initCgState,
  updateCgState,
  type CofdCgState,
} from "../src/chargen/state.ts";
import {
  addGiftFacet,
  addRite,
  removeGiftFacet,
  validateGiftStage,
  giftPackage,
  shadowAffinityGifts,
  auspiceMoonGift,
} from "../src/chargen/gifts.ts";
import { validateCurrentStage } from "../src/chargen/validate.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("Werewolf: The Forsaken Template", OPTS, () => {
  it("initializes werewolf sheets with correct defaults", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");

    assertEquals(sheet.template, "werewolf");
    assertEquals(sheet.powerStatValue, 1); // Primal Urge starts at 1
    assertEquals(sheet.energyCurrent, 10); // Essence max at Primal Urge 1 is 10
  });

  it("sets and gets custom fields: auspice, tribe, blood, bone", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");

    sheet = setTrait(sheet, "auspice", "Rahu");
    sheet = setTrait(sheet, "tribe", "Blood Talons");
    sheet = setTrait(sheet, "blood", "Destroyer");
    sheet = setTrait(sheet, "bone", "Soldier");

    assertEquals(sheet.customFields.auspice, "Rahu");
    assertEquals(sheet.customFields.tribe, "Blood Talons");
    assertEquals(sheet.customFields.blood, "Destroyer");
    assertEquals(sheet.customFields.bone, "Soldier");
  });

  it("sets and validates Renown as the werewolf power group", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");

    const val = validateTraitValue("glory", "2", sheet);
    sheet = setTrait(sheet, "glory", val);
    assertEquals(sheet.powers.glory, 2);

    const valPurity = validateTraitValue("purity", "1", sheet);
    sheet = setTrait(sheet, "purity", valPurity);
    assertEquals(sheet.powers.purity, 1);
  });

  it("throws when setting non-werewolf powers", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");

    try {
      validateTraitValue("vigor", "3", sheet);
      assert(false, "Should have thrown for invalid power");
    } catch (e) {
      assert(e instanceof Error);
    }
  });

  it("renders werewolfSection correctly with set values", async () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");
    sheet = setTrait(sheet, "auspice", "Ithaeur");
    sheet = setTrait(sheet, "tribe", "Bone Shadows");
    sheet = setTrait(sheet, "blood", "Wreath");
    sheet = setTrait(sheet, "bone", "Crusader");
    sheet = setTrait(sheet, "primal urge", 3);
    sheet = setTrait(sheet, "essence", 12);

    const ctx: SheetContext = {
      playerName: "Arthur",
      actorId: "1",
      sheet,
      template: COFD_TEMPLATES.werewolf,
      width: 78,
    };
    const renderedLines = await werewolfSection.render(ctx);

    const fullText = renderedLines.join("\n");
    assertStringIncludes(fullText, "W E R E W O L F :   T H E   F O R S A K E N");
    assertStringIncludes(fullText, "Ithaeur");
    assertStringIncludes(fullText, "Bone Shadows");
    assertStringIncludes(fullText, "Wreath");
    assertStringIncludes(fullText, "Crusader");
    assertStringIncludes(fullText, "3  (Essence max 12)");
    assertStringIncludes(fullText, "12 / 12");
  });

  it("renders nothing for non-werewolf templates", async () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    const ctx: SheetContext = {
      playerName: "x", actorId: "1", sheet,
      template: COFD_TEMPLATES.changeling, width: 78,
    };
    assertEquals((await werewolfSection.render(ctx)).length, 0);
  });
});

describe("Werewolf dictionary", OPTS, () => {
  it("has the five auspices with correct Renown", () => {
    assertEquals(WTF_AUSPICES.length, 5);
    assertEquals(findAuspice("Cahalith")?.renown, "Glory");
    assertEquals(findAuspice("rahu")?.renown, "Purity");
    assertEquals(findAuspice("Irraka")?.renown, "Cunning");
  });

  it("has six tribes; Ghost Wolves have no Renown or Gifts", () => {
    assertEquals(WTF_TRIBES.length, 6);
    assertEquals(findTribe("Blood Talons")?.renown, "Glory");
    const ghost = findTribe("Ghost Wolves");
    assertEquals(ghost?.renown, "None");
    assertEquals(ghost?.gifts.length, 0);
  });

  it("has five Renown and five forms-worth of gifts categorized", () => {
    assertEquals(WTF_RENOWN.length, 5);
    assertEquals(giftsByType("moon").length, 5);
    assert(giftsByType("shadow").length >= 10);
    assertEquals(giftsByType("wolf").length, 3);
  });

  it("shadow gift facets all carry a distinct, valid Renown", () => {
    // The WtF 2e corebook gives Shadow Gifts uneven facet coverage (most have
    // all five Renown; Gift of Death has only three). Within a gift, no Renown
    // repeats.
    const renown = new Set(["Cunning", "Glory", "Honor", "Purity", "Wisdom"]);
    for (const g of giftsByType("shadow")) {
      assert(g.facets.length >= 3 && g.facets.length <= 5, `${g.name} facet count out of range: ${g.facets.length}`);
      const seen = new Set(g.facets.map((f) => f.renown));
      assertEquals(seen.size, g.facets.length, `${g.name} has duplicate Renown facets`);
      for (const r of seen) assert(renown.has(r), `${g.name} has bad Renown ${r}`);
    }
  });

  it("Gift of Evasion includes its Honor facet (Deny Everything)", () => {
    const evasion = WTF_GIFTS.find((g) => g.name === "Gift of Evasion");
    assert(evasion, "Gift of Evasion should exist");
    assertEquals(evasion!.facets.length, 5);
    assert(evasion!.facets.some((f) => f.name === "Deny Everything" && f.renown === "Honor"));
  });

  it("has both Wolf and Pack rites with ranks 1-5", () => {
    assert(WTF_RITES.some((r) => r.type === "wolf"));
    assert(WTF_RITES.some((r) => r.type === "pack"));
    for (const r of WTF_RITES) assert(r.rank >= 1 && r.rank <= 5);
  });
});

describe("Werewolf chargen budgets", OPTS, () => {
  it("werewolf gets 10 merit dots; others 7", () => {
    assertEquals(startingMeritDots("werewolf"), 10);
    assertEquals(startingMeritDots("changeling"), 7);
    assertEquals(startingMeritDots("mortal"), 7);
  });

  it("renown starting dots: 3 normally, 2 for Ghost Wolves", () => {
    assertEquals(startingPowerDots("werewolf", "Blood Talons"), 3);
    assertEquals(startingPowerDots("werewolf", "Ghost Wolves"), 2);
    assertEquals(startingPowerDots("changeling"), 3);
    assertEquals(startingPowerDots("mortal"), 0);
  });

  it("power label is Renown for werewolf", () => {
    assertEquals(powerLabel("werewolf"), "Renown");
    assertEquals(powerLabel("changeling"), "Contracts");
  });
});

describe("Stage-3 canonical custom fields", OPTS, () => {
  it("normalizes recognized values to canonical casing", () => {
    assertEquals(resolveCustomFieldValue("werewolf", "auspice", "rahu"), { kind: "ok", value: "Rahu" });
    assertEquals(resolveCustomFieldValue("werewolf", "tribe", "storm lords"), { kind: "ok", value: "Storm Lords" });
    assertEquals(resolveCustomFieldValue("changeling", "seeming", "FAIREST"), { kind: "ok", value: "Fairest" });
    assertEquals(resolveCustomFieldValue("changeling", "court", "spring"), { kind: "ok", value: "Spring" });
    assertEquals(resolveCustomFieldValue("changeling", "kith", "smith"), { kind: "ok", value: "Smith" });
  });

  it("rejects values that are not in the catalog", () => {
    const bad = resolveCustomFieldValue("werewolf", "auspice", "Not An Auspice");
    assertEquals(bad.kind, "invalid");
    assert(bad.kind === "invalid" && bad.error.includes("Cahalith"));
    assertEquals(resolveCustomFieldValue("werewolf", "tribe", "nope").kind, "invalid");
    assertEquals(resolveCustomFieldValue("changeling", "kith", "Gsmith").kind, "invalid");
  });

  it("treats free-form fields (blood, bone, needle, thread) as free", () => {
    assertEquals(resolveCustomFieldValue("werewolf", "blood", "Destroyer").kind, "free");
    assertEquals(resolveCustomFieldValue("werewolf", "bone", "Anything goes").kind, "free");
    assertEquals(resolveCustomFieldValue("changeling", "needle", "Whatever").kind, "free");
    assertEquals(resolveCustomFieldValue("changeling", "thread", "Whatever").kind, "free");
  });
});

function wwState(opts: { purity?: number; honor?: number; glory?: number; tribe?: string; auspice?: string } = {}): CofdCgState {
  const s = initCgState();
  s.sheet.template = "werewolf";
  s.sheet.customFields.auspice = opts.auspice ?? "Rahu";
  s.sheet.customFields.tribe = opts.tribe ?? "Storm Lords";
  s.sheet.powers.purity = opts.purity ?? 1;
  if (opts.honor) s.sheet.powers.honor = opts.honor;
  if (opts.glory) s.sheet.powers.glory = opts.glory;
  s.stage = 8;
  return s;
}

function addAll(s: CofdCgState, facets: string[]): CofdCgState {
  for (const f of facets) s = addGiftFacet(s, f);
  return s;
}

describe("Werewolf Stage 8 -- Gifts & Rites", OPTS, () => {
  it("Werewolf chargen has 8 stages; others fewer", () => {
    assertEquals(maxStageFor("werewolf"), 8);
    assertEquals(maxStageFor("changeling"), 7);
    assertEquals(maxStageFor("mortal"), 6);
  });

  it("computes the starting package from auspice Renown and tribe", () => {
    const pkg = giftPackage(wwState({ purity: 2, honor: 1 }).sheet)!;
    assertEquals(pkg.moonMax, 2);          // Purity 2 -> 2nd Moon facet allowed
    assertEquals(pkg.shadowCount, 2);
    assertEquals(pkg.totalFacets, 4);
    assertEquals(pkg.riteDots, 2);
    const ghost = giftPackage(wwState({ purity: 2, tribe: "Ghost Wolves" }).sheet)!;
    assertEquals(ghost.ghostWolf, true);
    assertEquals(ghost.shadowCount, 1);
    assertEquals(ghost.totalFacets, 3);
  });

  it("maps auspice Moon Gift and tribe Shadow affinities", () => {
    const s = wwState().sheet;
    assertEquals(auspiceMoonGift(s)?.name, "Full Moon's Gift");
    const aff = shadowAffinityGifts(s).map((g) => g.name).sort();
    assertEquals(aff, ["Gift of Dominance", "Gift of Evasion", "Gift of Weather"]);
  });

  it("accepts a full valid package and reports it complete", () => {
    let s = wwState({ purity: 2, honor: 1 });
    s = addAll(s, ["Killer Instinct", "Hit and Run", "Snarl of the Predator", "Warrior's Hide"]);
    s = addRite(s, "Sacred Hunt");
    assertEquals(s.sheet.gifts, ["Killer Instinct", "Hit and Run", "Snarl of the Predator", "Warrior's Hide"]);
    assertEquals(validateGiftStage(s.sheet).valid, true);
    assertEquals(validateCurrentStage(s).valid, true); // routes through case 8
  });

  it("rejects a facet whose Renown the character lacks", () => {
    const s = wwState({ purity: 2, honor: 1 }); // no Glory
    // Glorious Lunacy is Gift of Dominance (tribal) but a Glory facet.
    let threw = "";
    try { addGiftFacet(s, "Glorious Lunacy"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "Glory Renown");
  });

  it("rejects a Shadow facet outside the tribe's affinities", () => {
    const s = wwState({ purity: 2 }); // Bone Gnaw = Gift of Death (Purity), not a Storm Lord gift
    let threw = "";
    try { addGiftFacet(s, "Bone Gnaw"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "not one of your tribe's");
  });

  it("rejects the 2nd Moon facet without 2 dots of auspice Renown", () => {
    let s = wwState({ purity: 1, honor: 1, glory: 1 }); // auspice Renown only 1
    s = addGiftFacet(s, "Killer Instinct"); // dot 1 ok
    let threw = "";
    try { addGiftFacet(s, "Warrior's Hide"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "dots of Purity Renown");
  });

  it("enforces Moon facet order", () => {
    const s = wwState({ purity: 2 });
    let threw = "";
    try { addGiftFacet(s, "Warrior's Hide"); } catch (e) { threw = (e as Error).message; } // skips dot 1
    assertStringIncludes(threw, "in order");
  });

  it("caps starting Rites at 2 dots", () => {
    const s = wwState({ purity: 2, honor: 1 });
    let threw = "";
    try { addRite(s, "Kindle Fury"); } catch (e) { threw = (e as Error).message; } // rank 3
    assertStringIncludes(threw, "exceeds your 2 starting Rite dots");
  });

  it("incomplete package fails validation", () => {
    let s = wwState({ purity: 2, honor: 1 });
    s = addGiftFacet(s, "Killer Instinct");
    assertEquals(validateGiftStage(s.sheet).valid, false);
  });

  it("ungift removes a chosen facet", () => {
    let s = wwState({ purity: 2 });
    s = addGiftFacet(s, "Killer Instinct");
    s = removeGiftFacet(s, "killer instinct");
    assertEquals(s.sheet.gifts, []);
  });

  it("+cg/set is rejected in Stage 8", () => {
    const s = wwState({ purity: 2 });
    let threw = "";
    try { updateCgState(s, "purity", "1"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "Stage 8");
  });
});

describe("Werewolf +cg/list and +info", OPTS, () => {
  it("lists auspices, tribes, renown, gifts, and rites", () => {
    assertStringIncludes(renderCgList("auspices"), "Cahalith");
    assertStringIncludes(renderCgList("tribes"), "Ghost Wolves");
    assertStringIncludes(renderCgList("renown"), "Wisdom");
    assertStringIncludes(renderCgList("gifts"), "Shadow Gifts");
    assertStringIncludes(renderCgList("rites"), "Wolf Rites");
  });

  it("fuzzy-matches a gift name for its facets", () => {
    const out = renderCgList("gifts rage");
    assertStringIncludes(out, "Gift of Rage");
    assertStringIncludes(out, "Incite Fury");
  });

  it("+info resolves auspice, facet, and rite by name", () => {
    assertStringIncludes(renderInfo("Rahu"), "[Auspice / Full Moon]");
    assertStringIncludes(renderInfo("Primal Strength"), "[Facet / Purity]");
    assertStringIncludes(renderInfo("Sacred Hunt"), "Wolf Rite");
  });
});
