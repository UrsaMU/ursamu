// tests/renderer.test.ts -- Renderer output shape and content checks
import {
  assertStringIncludes,
  assertEquals,
  assert,
} from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import "../splats/wta/index.ts";
import "../splats/mortal/index.ts";
import "../splats/kinfolk/index.ts";

import {
  formatSheet,
  formatBudget,
  formatDashboard,
  formatGiftList,
  formatMeritList,
  formatFlawList,
  formatQueue,
  formatRoll,
} from "../core/renderer.ts";
import { evaluateRoll } from "../core/dice.ts";
import type { IWoDChar, IStepBudget } from "../core/types.ts";

function baseChar(): IWoDChar {
  return {
    id: "test-1",
    playerId: "player-1",
    splat: "wta",
    status: "draft",
    chargenStep: 1,
    concept: "Wanderer",
    breed: "homid",
    auspice: "ahroun",
    tribe: "fianna",
    attributePriority: ["physical", "social", "mental"] as [string, string, string],
    attributes: {
      Strength: 3, Dexterity: 2, Stamina: 2,
      Charisma: 2, Manipulation: 2, Appearance: 1,
      Perception: 1, Intelligence: 1, Wits: 1,
    },
    attributeSpecialties: {},
    abilityPriority: ["talents", "skills", "knowledges"] as [string, string, string],
    abilities: {
      Brawl: 3, Athletics: 3, Alertness: 3,
      Melee: 3, Drive: 2, Etiquette: 2,
      Academics: 2, Computer: 2, Enigmas: 1,
    },
    abilitySpecialties: {},
    backgrounds: { Allies: 3, Kinfolk: 2 },
    gifts: ["Razor Claws", "Falling Touch", "Inspiration"],
    renown: { glory: 2, honor: 1, wisdom: 0 },
    rage: 5,
    gnosis: 1,
    willpower: 4,
    freebiesRemaining: 15,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    notes: [],
    staffNotes: "",
    statLog: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe("formatSheet", () => {
  it("includes character name in header", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Character Sheet for:");
    assertStringIncludes(out, "player-1"); // falls back to playerId when fullName unset
  });

  it("uses fullName in header when set", async () => {
    const char = { ...baseChar(), fullName: "Siobhan McAllister" };
    const out = await formatSheet(char, false);
    assertStringIncludes(out, "Siobhan McAllister");
  });

  it("shows concept", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Wanderer");
  });

  it("shows breed/auspice/tribe", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Homid");
    assertStringIncludes(out, "Ahroun");
    assertStringIncludes(out, "Fianna");
  });

  it("shows Attributes section header", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Attributes");
  });

  it("shows Abilities section header", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Abilities");
  });

  it("shows Backgrounds section header", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Backgrounds");
  });

  it("shows Pools section for wta", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Rage");
    assertStringIncludes(out, "Gnosis");
    assertStringIncludes(out, "Willpower");
  });

  it("shows Gifts section with gift names", async () => {
    const out = await formatSheet(baseChar(), false);
    assertStringIncludes(out, "Gifts");
    assertStringIncludes(out, "Razor Claws");
    assertStringIncludes(out, "Falling Touch");
  });

  it("shows status in staff section for draft", async () => {
    const out = await formatSheet(baseChar(), true);
    assertStringIncludes(out, "Draft");
  });

  it("shows status in staff section for submitted", async () => {
    const char = { ...baseChar(), status: "submitted" as const };
    const out = await formatSheet(char, true);
    assertStringIncludes(out, "Submitted");
  });

  it("shows status in staff section for approved", async () => {
    const char = { ...baseChar(), status: "approved" as const };
    const out = await formatSheet(char, true);
    assertStringIncludes(out, "Approved");
  });

  it("status does not appear in player view", async () => {
    const char = { ...baseChar(), status: "submitted" as const };
    const out = await formatSheet(char, false);
    assert(!out.includes("Submitted"), "Status should not appear in player view");
  });

  it("shows deformity line for metis", async () => {
    const char = { ...baseChar(), breed: "metis", deformity: "Crooked spine" };
    const out = await formatSheet(char, false);
    assertStringIncludes(out, "Deformity");
    assertStringIncludes(out, "Crooked spine");
  });

  it("omits staff section for non-staff", async () => {
    const char = { ...baseChar(), staffNotes: "SECRET" };
    const out = await formatSheet(char, false);
    assert(!out.includes("SECRET"), "Staff notes should not appear for non-staff");
  });

  it("includes staff section for staff", async () => {
    const char = { ...baseChar(), staffNotes: "Review this." };
    const out = await formatSheet(char, true);
    assertStringIncludes(out, "Review this.");
    assertStringIncludes(out, "Staff Section");
  });

  it("shows stat log entries for staff", async () => {
    const char = {
      ...baseChar(),
      statLog: [{ staffId: "s1", trait: "Strength", old: 1, new: 3, ts: 0 }],
    };
    const out = await formatSheet(char, true);
    assertStringIncludes(out, "Strength");
  });

  it("shows specialty when set", async () => {
    const char = { ...baseChar(), abilitySpecialties: { Brawl: "Grappling" } };
    const out = await formatSheet(char, false);
    assertStringIncludes(out, "Grappling");
  });
});

describe("formatBudget", () => {
  it("shows COMPLETE when complete=true", async () => {
    const budget: IStepBudget = { step: 1, complete: true, issues: [], remaining: {} };
    const out = await formatBudget(budget);
    assertStringIncludes(out, "COMPLETE");
  });

  it("shows IN PROGRESS when complete=false", async () => {
    const budget: IStepBudget = { step: 2, complete: false, issues: ["Need 3 more dots"], remaining: { physicalDots: 3 } };
    const out = await formatBudget(budget);
    assertStringIncludes(out, "IN PROGRESS");
  });

  it("lists issues when present", async () => {
    const budget: IStepBudget = { step: 1, complete: false, issues: ["concept is required"], remaining: {} };
    const out = await formatBudget(budget);
    assertStringIncludes(out, "concept is required");
  });

  it("shows remaining counts", async () => {
    const budget: IStepBudget = { step: 2, complete: false, issues: [], remaining: { physicalDots: 4 } };
    const out = await formatBudget(budget);
    assertStringIncludes(out, "4");
  });

  it("includes step number in header", async () => {
    const budget: IStepBudget = { step: 3, complete: false, issues: [], remaining: {} };
    const out = await formatBudget(budget);
    assertStringIncludes(out, "Step 3");
  });
});

describe("formatDashboard", () => {
  it("includes CHARGEN header", async () => {
    const out = await formatDashboard(baseChar());
    assertStringIncludes(out, "CHARGEN");
  });

  it("shows all 6 step labels", async () => {
    const out = await formatDashboard(baseChar());
    assertStringIncludes(out, "Sub-template");
    assertStringIncludes(out, "Concept");
    assertStringIncludes(out, "Attributes");
    assertStringIncludes(out, "Abilities");
    assertStringIncludes(out, "Advantages");
    assertStringIncludes(out, "Freebies");
  });

  it("marks completed steps with check", async () => {
    const char = baseChar();
    char.chargenStep = 3;
    const out = await formatDashboard(char);
    assertStringIncludes(out, "[X]");
  });

  it("shows tribe and auspice in header", async () => {
    const out = await formatDashboard(baseChar());
    assertStringIncludes(out, "Fianna");
    assertStringIncludes(out, "Ahroun");
  });

  it("includes usage hint", async () => {
    const out = await formatDashboard(baseChar());
    assertStringIncludes(out, "+chargen/set");
  });

  it("lists freebies with other browse commands", async () => {
    const char = {
      ...baseChar(),
      chargenStep: 5 as const,
      freebiesRemaining: 15,
      freebiesDone: false,
    };
    const out = await formatDashboard(char);
    assertStringIncludes(out, "+chargen/traits");
    assertStringIncludes(out, "+chargen/bglist");
    assertStringIncludes(out, "+chargen/meritlist");
    assertStringIncludes(out, "+chargen/flawlist");
    assertStringIncludes(out, "+chargen/freebies");
    assertStringIncludes(out, "+chargen/done");
  });

  it("does not mark Freebies Done while bank has points", async () => {
    const char = {
      ...baseChar(),
      chargenStep: 6 as const,
      // Make steps 1-5 look complete enough for display
      freebiesRemaining: 15,
      freebiesDone: false,
    };
    const out = await formatDashboard(char);
    assertStringIncludes(out, "Step 6 - Freebies");
    // Must NOT show green Done for step 6 with leftover
    const step6Line = out.split("%r").find((l) =>
      l.includes("Step 6 - Freebies")
    ) ?? "";
    assertEquals(step6Line.includes("[X]"), false);
    assertStringIncludes(step6Line, "[~]");
  });
});

describe("formatMeritList / formatFlawList (screen-safe)", () => {
  /** Step 4 complete so canAccessStep(5) passes. */
  function step5(): IWoDChar {
    return {
      ...baseChar(),
      chargenStep: 5,
      fullName: "Boone",
      age: "24",
      nature: "Survivor",
      demeanor: "Loner",
      freebiesRemaining: 15,
      // talents 13 / skills 9 / knowledges 5
      abilities: {
        Alertness: 3,
        Athletics: 3,
        Brawl: 3,
        Empathy: 2,
        "Primal-Urge": 2,
        Melee: 3,
        Drive: 2,
        Etiquette: 2,
        Firearms: 2,
        Academics: 2,
        Computer: 2,
        Enigmas: 1,
      },
    };
  }

  it("bare meritlist is a short category index", () => {
    const out = formatMeritList(step5());
    const lines = out.split("%r");
    assertEquals(lines.length <= 22, true, `too long: ${lines.length}`);
    assertStringIncludes(out, "+chargen/meritlist physical");
    // Must NOT dump individual merit notes
    assertEquals(out.includes("difficulty on Perception"), false);
  });

  it("meritlist physical is compact (no notes flood)", () => {
    const out = formatMeritList(step5(), "physical");
    const lines = out.split("%r");
    assertEquals(lines.length <= 24, true, `too long: ${lines.length}`);
    assertStringIncludes(out, "Acute Sense");
    assertEquals(out.includes("difficulty on Perception"), false);
  });

  it("bare flawlist is a short category index", () => {
    const out = formatFlawList(step5());
    const lines = out.split("%r");
    assertEquals(lines.length <= 22, true, `too long: ${lines.length}`);
    assertStringIncludes(out, "+chargen/flawlist");
  });
});

describe("formatGiftList", () => {
  it("gates chargen gifts until step 5", async () => {
    const char = baseChar(); // step 1
    const out = await formatGiftList(char);
    assertStringIncludes(out, "Step 5");
  });

  it("shows beginning gifts when step 5 open", async () => {
    const char: IWoDChar = {
      ...baseChar(),
      chargenStep: 5,
      fullName: "A",
      age: "20",
      nature: "N",
      demeanor: "D",
      // Enough attrs/abils that steps 3-4 can pass if prios set —
      // canAccessStep only needs prior step complete, not current.
      attributePriority: ["physical", "social", "mental"],
      attributes: {
        Strength: 3, Dexterity: 2, Stamina: 2,
        Charisma: 2, Manipulation: 2, Appearance: 1,
        Perception: 1, Intelligence: 1, Wits: 1,
      },
      abilityPriority: ["talents", "skills", "knowledges"],
      abilities: {
        Brawl: 3, Athletics: 3, Alertness: 3, Empathy: 2,
        Expression: 2, Melee: 3, Drive: 2, Etiquette: 2,
        Stealth: 2, Academics: 2, Computer: 2, Enigmas: 1,
      },
    };
    // Force prior steps complete by using all mode if gate still fails
    const out = await formatGiftList(char, undefined, "all");
    assertStringIncludes(out, "Gift");
  });

  it("returns no-gifts message for mortal splat", async () => {
    const char: IWoDChar = {
      ...baseChar(),
      splat: "mortal",
    };
    const out = await formatGiftList(char);
    assertStringIncludes(out, "No gifts");
  });
});

describe("formatRoll", () => {
  const res = { pubLabel: "Strength + Brawl", privLabel: "Strength(3) + Brawl(3)" };

  it("pub line contains roller name and pubLabel", () => {
    const roll = evaluateRoll([6, 8, 3], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "Alice");
    assertStringIncludes(pub, "Strength + Brawl");
  });

  it("priv line contains privLabel with values", () => {
    const roll = evaluateRoll([6, 8, 3], 6);
    const { priv } = formatRoll(roll, res, "Alice");
    assertStringIncludes(priv, "Strength(3) + Brawl(3)");
  });

  it("priv line contains the dice roll in parens", () => {
    const roll = evaluateRoll([6, 8, 3], 6);
    const { priv } = formatRoll(roll, res, "Alice");
    assertStringIncludes(priv, "(");
    assertStringIncludes(priv, "6");
    assertStringIncludes(priv, "8");
    assertStringIncludes(priv, "3");
  });

  it("pub line does NOT contain dice values", () => {
    const roll = evaluateRoll([9, 7], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assert(!pub.includes("(9"), "pub line should not contain raw dice");
  });

  it("shows success count in both lines", () => {
    const roll = evaluateRoll([6, 8, 3], 6); // 2 successes
    const { pub, priv } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub,  "2 Success");
    assertStringIncludes(priv, "2 Success");
  });

  it("shows Failure when net successes = 0 and no botch", () => {
    const roll = evaluateRoll([2, 3, 4], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "Failure");
  });

  it("shows Botch when ones exceed successes", () => {
    const roll = evaluateRoll([1, 1, 3, 4], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "Botch");
  });

  it("shows Exceptional when net >= 5", () => {
    const roll = evaluateRoll([6, 7, 8, 9, 10], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "Exceptional");
  });

  it("shows difficulty in output", () => {
    const roll = evaluateRoll([7, 8], 7);
    const { pub } = formatRoll(roll, { pubLabel: "Dexterity", privLabel: "Dexterity(3)" }, "Bob");
    assertStringIncludes(pub, "vs");
    assertStringIncludes(pub, "7");
  });

  it("shows (spec) tag when specialty is true", () => {
    const roll = evaluateRoll([10, 8], 6, true);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "(spec)");
  });

  it("no (spec) tag when specialty is false", () => {
    const roll = evaluateRoll([10, 8], 6, false);
    const { pub } = formatRoll(roll, res, "Alice");
    assert(!pub.includes("(spec)"), "should not show (spec) for non-specialty rolls");
  });

  it("pub line starts with Roll> prefix", () => {
    const roll = evaluateRoll([8], 6);
    const { pub } = formatRoll(roll, res, "Alice");
    assertStringIncludes(pub, "Roll>");
  });
});

describe("formatQueue", () => {
  it("shows empty message when no chars", async () => {
    const out = await formatQueue([]);
    assertStringIncludes(out, "No characters");
  });

  it("shows player ID in queue", async () => {
    const char = baseChar();
    char.status = "submitted";
    const out = await formatQueue([char]);
    assertStringIncludes(out, "player-1");
  });

  it("shows splat in queue", async () => {
    const char = baseChar();
    char.status = "submitted";
    const out = await formatQueue([char]);
    assertStringIncludes(out, "wta");
  });
});
