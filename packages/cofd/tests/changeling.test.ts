import { assertEquals, assertStringIncludes, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { defaultSheet, setTrait, validateTraitValue } from "../cofd.ts";
import { changelingSection } from "../src/sheet/sections/changeling.ts";
import type { SheetContext } from "../src/sheet/sections/types.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import {
  initCgState,
  updateCgState,
  maxStageFor,
  type CofdCgState,
} from "../src/chargen/state.ts";
import { findCourt, findKith, findSeeming, kithsForSeeming } from "../src/dictionary/changeling.ts";
import { validateCurrentStage } from "../src/chargen/validate.ts";
import {
  addContract,
  removeContract,
  validateContractStage,
  favoredRegalia,
  contractPackage,
  contractCatalogSize,
} from "../src/chargen/contracts.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function ctlState(opts: { seeming?: string; court?: string; favored?: string } = {}): CofdCgState {
  const s = initCgState();
  s.sheet.template = "changeling";
  s.sheet.customFields.seeming = opts.seeming ?? "Wizened";
  s.sheet.customFields.court = opts.court ?? "Spring";
  s.sheet.customFields.favored = opts.favored ?? "Crown";
  s.stage = 7;
  return s;
}

function addAllC(s: CofdCgState, names: string[]): CofdCgState {
  for (const n of names) s = addContract(s, n);
  return s;
}

describe("Changeling: The Lost Template", OPTS, () => {
  it("initializes changeling sheets with correct defaults", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");

    assertEquals(sheet.template, "changeling");
    assertEquals(sheet.powerStatValue, 1); // Wyrd starts at 1 via direct transition
    assertEquals(sheet.energyCurrent, 10); // Glamour max at Wyrd 1 is 10
  });

  it("sets and gets custom fields: seeming, kith, court, needle, thread", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");

    sheet = setTrait(sheet, "seeming", "Wizened");
    sheet = setTrait(sheet, "kith", "Gsmith");
    sheet = setTrait(sheet, "court", "Autumn");
    sheet = setTrait(sheet, "needle", "Bon Vivant");
    sheet = setTrait(sheet, "thread", "Hedonist");

    assertEquals(sheet.customFields.seeming, "Wizened");
    assertEquals(sheet.customFields.kith, "Gsmith");
    assertEquals(sheet.customFields.court, "Autumn");
    assertEquals(sheet.customFields.needle, "Bon Vivant");
    assertEquals(sheet.customFields.thread, "Hedonist");
  });

  it("kith sets seeming so either order works", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    sheet = setTrait(sheet, "kith", "Dancer");
    assertEquals(sheet.customFields.kith, "Dancer");
    assertEquals(sheet.customFields.seeming, "Fairest");
  });

  it("seeming change clears mismatched kith and same favored", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    sheet = setTrait(sheet, "seeming", "Fairest");
    sheet = setTrait(sheet, "kith", "Dancer");
    // Fairest favors Crown — second favored must differ
    let threw = "";
    try {
      setTrait(sheet, "favored", "Crown");
    } catch (e: unknown) {
      threw = e instanceof Error ? e.message : String(e);
    }
    assert(
      threw.toLowerCase().includes("differ"),
      "expected favored clash error",
    );
    sheet = setTrait(sheet, "favored", "Sword");
    assertEquals(sheet.customFields.favored, "Sword");
    sheet = setTrait(sheet, "seeming", "Beast");
    assertEquals(sheet.customFields.kith, undefined);
    // Beast favors Steed; Sword stays
    assertEquals(sheet.customFields.favored, "Sword");
    try {
      setTrait(sheet, "favored", "Steed");
      assert(false, "Steed should clash with Beast");
    } catch (e: unknown) {
      assert(e instanceof Error);
    }
  });

  it("throws when setting non-changeling powers", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");

    try {
      validateTraitValue("vigor", "3", sheet);
      assert(false, "Should have thrown for invalid power");
    } catch (e) {
      assert(e instanceof Error);
    }
  });

  it("renders changelingSection as Contracts only (no identity dupes)", async () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    sheet = setTrait(sheet, "seeming", "Fairest");
    sheet = setTrait(sheet, "kith", "Dancer");
    sheet = setTrait(sheet, "court", "Spring");
    sheet = setTrait(sheet, "needle", "Protector");
    sheet = setTrait(sheet, "thread", "Believer");
    sheet = setTrait(sheet, "wyrd", 3);
    sheet = setTrait(sheet, "glamour", 12);
    sheet.contracts = ["Mask of Superiority", "Hostile Takeover"];

    const ctx: SheetContext = {
      playerName: "Arthur",
      actorId: "1",
      sheet,
      template: COFD_TEMPLATES.changeling,
      width: 78,
    };
    const renderedLines = await changelingSection.render(ctx);

    const fullText = renderedLines.join("\n");
    // Contracts only -- identity/pools live in header + advantages.
    assertStringIncludes(fullText, "C O N T R A C T S");
    assertStringIncludes(fullText, "Mask of Superiority");
    assertStringIncludes(fullText, "Hostile Takeover");
    // No duplicated identity fields.
    if (fullText.includes("Seeming:")) {
      throw new Error("Seeming should not appear in changelingSection");
    }
    if (fullText.includes("Wyrd:")) {
      throw new Error("Wyrd should not appear in changelingSection");
    }
  });

  it("renders nothing when changeling has no contracts", async () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    const ctx: SheetContext = {
      playerName: "Arthur",
      actorId: "1",
      sheet,
      template: COFD_TEMPLATES.changeling,
      width: 78,
    };
    assertEquals((await changelingSection.render(ctx)).length, 0);
  });
});

describe("Changeling Stage 7 -- Contracts", OPTS, () => {
  it("Changeling chargen has 7 stages", () => {
    assertEquals(maxStageFor("changeling"), 7);
  });

  it("has a sizeable Contract catalog", () => {
    assert(contractCatalogSize() >= 100);
  });

  it("favored Regalia = seeming's favored + the chosen second", () => {
    const fav = favoredRegalia(ctlState({ seeming: "Wizened", favored: "Crown" }).sheet);
    assertEquals(fav.map((r) => r.toLowerCase()).sort(), ["crown", "jewels"]);
  });

  it("computes the starting package", () => {
    const pkg = contractPackage(ctlState().sheet);
    assertEquals(pkg.commonCount, 4);
    assertEquals(pkg.royalCount, 2);
    assertEquals(pkg.favoredCommonMin, 2);
    assertEquals(pkg.goblinMax, 2);
  });

  it("accepts a full valid package and reports it complete", () => {
    let s = ctlState({ seeming: "Wizened", court: "Spring", favored: "Crown" });
    // 4 Common: 2 favored (Jewels) Arcadian + 1 Goblin + 1 Spring Court common.
    s = addAllC(s, ["Blessing of Perfection", "Light-Shy", "Goblin's Luck", "Cupid's Arrow"]);
    // 2 Royal: a favored (Jewels) Royal Arcadian + a Spring Court royal.
    s = addAllC(s, ["Changeling Hours", "Blessing of Spring"]);
    assertEquals(validateContractStage(s.sheet).valid, true);
    assertEquals(validateCurrentStage(s).valid, true); // routes through case 7
  });

  it("rejects a Royal Arcadian Contract not from a favored Regalia", () => {
    const s = ctlState({ seeming: "Wizened", favored: "Crown" }); // favored Jewels+Crown
    let threw = "";
    try { addContract(s, "Red Revenge"); } catch (e) { threw = (e as Error).message; } // Sword royal
    assertStringIncludes(threw, "favored Regalia");
  });

  it("rejects a Court Contract of another court", () => {
    const s = ctlState({ court: "Spring" });
    let threw = "";
    try { addContract(s, "Baleful Sense"); } catch (e) { threw = (e as Error).message; } // Summer
    assertStringIncludes(threw, "Court");
  });

  it("caps Goblin Contracts at two", () => {
    let s = ctlState();
    s = addAllC(s, ["Goblin's Luck", "Goblin's Eye"]);
    let threw = "";
    try { addContract(s, "Glib Tongue"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "Goblin");
  });

  it("incomplete package fails validation", () => {
    let s = ctlState();
    s = addContract(s, "Blessing of Perfection");
    assertEquals(validateContractStage(s.sheet).valid, false);
  });

  it("requires 2 favored-Regalia Common Arcadian contracts", () => {
    let s = ctlState({ seeming: "Wizened", court: "Spring", favored: "Crown" });
    // 4 commons but only ONE from a favored Regalia (Blessing of Perfection = Jewels);
    // the rest are a non-favored Arcadian, a goblin, and a court common.
    s = addAllC(s, ["Blessing of Perfection", "Cloak of Night", "Goblin's Luck", "Cupid's Arrow"]);
    s = addAllC(s, ["Changeling Hours", "Blessing of Spring"]);
    const res = validateContractStage(s.sheet);
    assertEquals(res.valid, false);
    assertStringIncludes(res.error ?? "", "favored Regalia");
  });

  it("uncontract removes a chosen Contract", () => {
    let s = ctlState();
    s = addContract(s, "Blessing of Perfection");
    s = removeContract(s, "blessing of perfection");
    assertEquals(s.sheet.contracts, []);
  });

  it("+cg/set is rejected in Stage 7 for changeling", () => {
    const s = ctlState();
    let threw = "";
    try { updateCgState(s, "spring", "2"); } catch (e) { threw = (e as Error).message; }
    assertStringIncludes(threw, "Contracts");
  });

  it("second favored Regalia must differ from the seeming's favored", () => {
    const s = ctlState({ seeming: "Wizened", favored: "Jewels" }); // Wizened already favors Jewels
    s.stage = 3;
    s.sheet.customFields.kith = "Smith";
    s.sheet.customFields.needle = "x";
    s.sheet.customFields.thread = "y";
    const res = validateCurrentStage(s);
    assertEquals(res.valid, false);
    assertStringIncludes(res.error ?? "", "differ");
  });
});

describe("Changeling Dictionary Lookups", OPTS, () => {
  it("findCourt handles exact matches, case-insensitivity, and misses", () => {
    assertEquals(findCourt("Spring")?.name, "Spring");
    assertEquals(findCourt("  aUtUmN  ")?.name, "Autumn");
    assertEquals(findCourt("Summer")?.name, "Summer");
    assertEquals(findCourt("Winter")?.name, "Winter");
    assertEquals(findCourt("NonExistent"), null);
    assertEquals(findCourt(""), null);
  });

  it("findKith handles exact matches, case-insensitivity, and misses", () => {
    assertEquals(findKith("Broadback")?.name, "Broadback");
    assertEquals(findKith("  cLeArEyEs  ")?.name, "Cleareyes");
    assertEquals(findKith("NotAKith"), null);
    assertEquals(findKith(""), null);
  });

  it("findSeeming handles exact matches, case-insensitivity, and misses", () => {
    assertEquals(findSeeming("Beast")?.name, "Beast");
    assertEquals(findSeeming("  dArKlInG  ")?.name, "Darkling");
    assertEquals(findSeeming("NotASeeming"), null);
    assertEquals(findSeeming(""), null);
  });

  it("kithsForSeeming returns correct kiths", () => {
    const beastKiths = kithsForSeeming("Beast");
    assert(beastKiths.length > 0, "Beast should have kiths");
    assert(beastKiths.some(k => k.name === "Broadback"));
    assert(beastKiths.some(k => k.name === "Hunterheart"));
    assert(!beastKiths.some(k => k.name === "Airtouched")); // Elemental kith

    assertEquals(kithsForSeeming("NotASeeming").length, 0);
  });
});
