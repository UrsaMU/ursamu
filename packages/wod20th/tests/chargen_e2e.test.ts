// tests/chargen_e2e.test.ts -- Full WtA chargen path through submit.
// Core engine only (no command layer): applySet / spend / done / validate.
import {
  assertEquals,
  assertStringIncludes,
} from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

import "../splats/wta/index.ts";
import {
  applySet,
  applySpend,
  applyFreebiesDone,
  applyPriority,
  applyNote,
  advanceStep,
} from "../core/chargen.ts";
import { validateStep } from "../core/validator.ts";
import { formatDashboard } from "../core/renderer.ts";
import type { IWoDChar } from "../core/types.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function blank(): IWoDChar {
  return {
    id: "e2e-1",
    playerId: "e2e-player",
    splat: "wta",
    status: "draft",
    chargenStep: 1,
    concept: "",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 3,
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

function must(ok: boolean, msg: string): void {
  assertEquals(ok, true, msg);
}

function allStepsGreen(c: IWoDChar): boolean {
  return ([1, 2, 3, 4, 5, 6] as const).every((s) =>
    validateStep(c, s).complete
  );
}

Deno.test(
  "e2e: full WtA chargen to submit-ready (done + all green)",
  OPTS,
  async () => {
    const c = blank();

    // -- Step 1 -------------------------------------------------------------
    must(applySet(c, "breed", "homid").ok, "breed");
    must(applySet(c, "auspice", "theurge").ok, "auspice");
    must(applySet(c, "tribe", "wendigo").ok, "tribe");
    assertEquals(validateStep(c, 1).complete, true);
    must(advanceStep(c).ok, "advance 1->2");

    // -- Step 2 -------------------------------------------------------------
    must(applySet(c, "fullName", "Maya Whitehorse").ok, "fullName");
    must(applySet(c, "age", "24").ok, "age");
    must(applySet(c, "concept", "Wandering Theurge").ok, "concept");
    must(applySet(c, "nature", "Visionary").ok, "nature");
    must(applySet(c, "demeanor", "Loner").ok, "demeanor");
    assertEquals(validateStep(c, 2).complete, true);
    must(advanceStep(c).ok, "advance 2->3");

    // -- Step 3: 7/5/3 extras (final ratings) ------------------------------
    must(
      applyPriority(c, "attrs", "physical/mental/social").ok,
      "attr pri",
    );
    // physical 7: Str 3 Dex 4 Sta 3 → extras 2+3+2=7
    must(applySet(c, "Strength", "3").ok, "str");
    must(applySet(c, "Dexterity", "4").ok, "dex");
    must(applySet(c, "Stamina", "3").ok, "sta");
    // mental 5: Per 3 Int 2 Wits 3 → 2+1+2=5
    must(applySet(c, "Perception", "3").ok, "per");
    must(applySet(c, "Intelligence", "2").ok, "int");
    must(applySet(c, "Wits", "3").ok, "wits");
    // social 3: Cha 2 Man 2 App 2 → 1+1+1=3
    must(applySet(c, "Charisma", "2").ok, "cha");
    must(applySet(c, "Manipulation", "2").ok, "man");
    must(applySet(c, "Appearance", "2").ok, "app");
    assertEquals(
      validateStep(c, 3).complete,
      true,
      validateStep(c, 3).issues.join("; "),
    );
    must(advanceStep(c).ok, "advance 3->4");

    // -- Step 4: 13/9/5 -----------------------------------------------------
    must(
      applyPriority(c, "abilities", "talents/skills/knowledges").ok,
      "abil pri",
    );
    must(applySet(c, "Alertness", "3").ok, "alert");
    must(applySet(c, "Brawl", "3").ok, "brawl");
    must(applySet(c, "Athletics", "2").ok, "ath");
    must(applySet(c, "Primal-Urge", "3").ok, "pu");
    must(applySet(c, "Empathy", "2").ok, "emp");
    must(applySet(c, "Stealth", "3").ok, "ste");
    must(applySet(c, "Survival", "3").ok, "sur");
    must(applySet(c, "Melee", "2").ok, "mel");
    must(applySet(c, "Animal-Ken", "1").ok, "ak");
    must(applySet(c, "Occult", "2").ok, "occ");
    must(applySet(c, "Rituals", "2").ok, "rit");
    must(applySet(c, "Enigmas", "1").ok, "eni");
    assertEquals(
      validateStep(c, 4).complete,
      true,
      validateStep(c, 4).issues.join("; "),
    );
    must(advanceStep(c).ok, "advance 4->5");

    // -- Step 5: bgs + gifts + optional merit/flaw -------------------------
    must(applySet(c, "Allies", "2").ok, "allies");
    must(applySet(c, "Totem", "2").ok, "totem");
    must(applySet(c, "Mentor(Elder Theurge)", "1").ok, "mentor");
    assertEquals(c.backgrounds["Totem"], 2);
    assertEquals(c.backgrounds["Allies"], 2);
    must(applySet(c, "gift", "Persuasion").ok, "gift breed");
    must(applySet(c, "gift", "Mother's Touch").ok, "gift auspice");
    must(applySet(c, "gift", "Call the Breeze").ok, "gift tribe");
    must(applySet(c, "merit", "Acute Sense").ok, "merit");
    must(applySet(c, "Language(Spanish)", "1").ok, "lang");
    must(applySet(c, "flaw", "Curiosity").ok, "flaw");
    assertEquals(
      validateStep(c, 5).complete,
      true,
      validateStep(c, 5).issues.join("; "),
    );
    must(advanceStep(c).ok, "advance 5->6");
    assertEquals(c.chargenStep, 6);

    // -- Step 6 freebies: spend some, leave leftover, /done ----------------
    const before = c.freebiesRemaining;
    must(applySpend(c, "Rage", "2").ok, "rage");
    must(applySpend(c, "Gnosis", "1").ok, "gnosis");
    must(applySpend(c, "Willpower", "2").ok, "wp");
    assertEquals(c.freebiesRemaining < before, true);
    assertEquals(validateStep(c, 6).complete, false, "need /done");

    // Earlier steps must stay green after freebie raises
    for (const s of [1, 2, 3, 4, 5] as const) {
      assertEquals(
        validateStep(c, s).complete,
        true,
        `step ${s} broke after spend: ${validateStep(c, s).issues.join("; ")}`,
      );
    }

    const done = applyFreebiesDone(c);
    must(done.ok, "done");
    assertStringIncludes(done.message, "NOT a staff submit");
    assertStringIncludes(done.message, "+chargen/submit");
    assertEquals(validateStep(c, 6).complete, true);
    assertEquals(allStepsGreen(c), true, "all steps green");

    // Notes + dashboard finish hint
    must(applyNote(c, "pack", "Seeks vanished pack.").ok, "note");
    const dash = await formatDashboard(c);
    assertStringIncludes(dash, "How to finish");
    assertStringIncludes(dash, "+chargen/submit");
    assertStringIncludes(dash, "submit");

    // Simulate submit gate (same checks as command)
    const issues: string[] = [];
    for (const s of [1, 2, 3, 4, 5, 6] as const) {
      const b = validateStep(c, s);
      if (!b.complete) {
        issues.push(...b.issues.map((i) => `Step ${s}: ${i}`));
      }
    }
    assertEquals(issues, [], issues.join(" | "));

    c.status = "submitted";
    assertEquals(c.status, "submitted");
    assertEquals(c.gifts?.[0], "Persuasion");
    assertEquals(c.merits?.["Language (Spanish)"], 1);
    assertEquals(c.backgroundDetails?.["Mentor"], "Elder Theurge");
  },
);

describe("e2e finish semantics", () => {
  it("/done is not submit", () => {
    const c = blank();
    c.chargenStep = 6;
    c.freebiesRemaining = 5;
    const r = applyFreebiesDone(c);
    assertEquals(r.ok, true);
    assertEquals(c.status, "draft");
    assertEquals(c.freebiesDone, true);
    assertStringIncludes(r.message, "NOT a staff submit");
    assertStringIncludes(r.message, "+chargen/submit");
  });
});
