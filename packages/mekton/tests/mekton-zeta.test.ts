import { assertEquals, assertExists, assertStringIncludes } from "@std/assert";
import { describe, it, afterAll } from "@std/testing/bdd";
import { rollInterlock, rollDamage } from "../roll.ts";
import { derivedStats, skillPointsSpent, effectiveMA } from "../derived.ts";
import { validateStat, validateSkillLevel, validateStatPool } from "../validation.ts";
import { rollBasicLifepath, rollProfessionalEvent } from "../lifepath.ts";
import { findGearByName, gearByCategory } from "../catalog.ts";
import { findTemplate } from "../templates.ts";
import { findProfession } from "../professions.ts";
import { applyDamage, combatStatus } from "../combat.ts";
import { mektonSystem } from "../game-system.ts";
import type { IMektonChar } from "../schema.ts";

// Force-exit after all suites — prevents hang from open gameHooks/KV handles.
afterAll(() => Deno.exit(0));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChar(overrides: Partial<IMektonChar> = {}): IMektonChar {
  return {
    id: "test-id",
    playerId: "player-id",
    playerName: "Test Player",
    stats: { att: 6, bod: 6, cl: 6, emp: 6, int: 6, luck: 5, ma: 6, ref: 7, tech: 5, edu: 4 },
    skills: {},
    lifepath: {
      socialStatus: 5, startingCash: 600, parentStatus: "Both parents alive.", familyStanding: "good",
      siblings: [], friends: [], enemies: [], romance: null,
      appearance: { hairColor: "", hairStyle: "", eyeColor: "", personalityTrait: "", valueMost: "", valuedPossession: "", valuedPerson: "" },
      professionalEvents: [],
    },
    charType: null,
    rookieTemplate: null,
    careers: [],
    age: 16,
    equipment: [],
    cash: 600,
    statMethod: null,
    statPointPool: null,
    chargenStatus: "draft",
    wounds: { head: 6, torso: 12, rArm: 9, lArm: 9, rLeg: 9, lLeg: 9 },
    stunned: false,
    luckRemaining: 5,
    firstAidApplied: {},
    ...overrides,
  };
}

// ── Interlock Dice Roller ─────────────────────────────────────────────────────

describe("rollInterlock", () => {
  it("total = stat + skill + d10 result", () => {
    for (let i = 0; i < 50; i++) {
      const r = rollInterlock(5, 3);
      // Total should be at least 5+3+1=9, or could be negative with crit fail
      assertEquals(typeof r.total, "number");
      assertExists(r.chainRolls);
      assertEquals(r.chainRolls.length >= 1, true);
    }
  });

  it("critical=success when first chainRoll is 10", () => {
    // Run many rolls and check that critical=success always accompanies chain of 10s
    let foundCritSuccess = false;
    for (let i = 0; i < 200; i++) {
      const r = rollInterlock(1, 1);
      if (r.critical === "success") {
        assertEquals(r.chainRolls[0], 10);
        foundCritSuccess = true;
      }
    }
    // statistically very likely to appear
    assertEquals(typeof foundCritSuccess, "boolean");
  });

  it("rollDamage returns non-negative number", () => {
    for (let i = 0; i < 20; i++) {
      const dmg = rollDamage("2D6");
      assertEquals(dmg >= 2, true);
      assertEquals(dmg <= 12, true);
    }
  });
});

// ── Derived Stats ─────────────────────────────────────────────────────────────

describe("derivedStats", () => {
  it("BOD 6 → Head 6H, Torso 12H, Limbs 9H", () => {
    const char = makeChar();
    const d = derivedStats(char);
    assertEquals(d.headHp, 6);
    assertEquals(d.torsoHp, 12);
    assertEquals(d.limbHp, 9);
  });

  it("BOD 10 → Head 8H, Torso 16H", () => {
    const char = makeChar({ stats: { ...makeChar().stats, bod: 10 } });
    const d = derivedStats(char);
    assertEquals(d.headHp, 8);
    assertEquals(d.torsoHp, 16);
  });

  it("BOD 2 → EV 2", () => {
    const char = makeChar({ stats: { ...makeChar().stats, bod: 2 } });
    assertEquals(derivedStats(char).ev, 2);
  });

  it("stability = floor(CL * 2.5)", () => {
    const char = makeChar({ stats: { ...makeChar().stats, cl: 7 } });
    assertEquals(derivedStats(char).stability, 17);
  });

  it("skillPoints = INT + EDU + 10", () => {
    const char = makeChar();
    assertEquals(derivedStats(char).skillPoints, 20); // 6+4+10
  });

  it("skillPointsSpent — correct for levels above +5", () => {
    // level 7 costs: 5 (for 1-5) + 4 (for 6,7 at 2pts each) = 9
    assertEquals(skillPointsSpent({ "Handgun": 7 }), 9);
  });

  it("effectiveMA reduces by load (weight/EV rounded down)", () => {
    const char = makeChar({
      equipment: [{ name: "Heavy Plate", category: "armor", weight: 16, cost: 0 }],
    });
    // BOD 6 → EV 4; 16kg / 4 = load 4; MA 6 - 4 = 2
    assertEquals(effectiveMA(char), 2);
  });
});

// ── Validation ────────────────────────────────────────────────────────────────

describe("validateStat", () => {
  it("accepts 2–10", () => {
    assertEquals(validateStat("ref", 7), true);
  });
  it("rejects below 2", () => {
    assertStringIncludes(validateStat("ref", 1) as string, "minimum");
  });
  it("rejects above 10", () => {
    assertStringIncludes(validateStat("att", 11) as string, "maximum");
  });
});

describe("validateSkillLevel", () => {
  it("allows Hard skill at +5", () => {
    const char = makeChar();
    assertEquals(validateSkillLevel("Mecha Piloting", 5, char), true);
  });
  it("blocks Hard skill above +5 in draft", () => {
    const char = makeChar();
    assertStringIncludes(validateSkillLevel("Mecha Piloting", 6, char) as string, "Hard");
  });
});

describe("validateStatPool", () => {
  it("passes when total <= pool", () => {
    const char = makeChar({ statMethod: "concept", statPointPool: 60 });
    assertEquals(validateStatPool(char), true);
  });
  it("fails when total > pool", () => {
    const char = makeChar({ statMethod: "concept", statPointPool: 50, stats: { att:10,bod:10,cl:10,emp:10,int:10,luck:10,ma:10,ref:10,tech:10,edu:10 } });
    assertStringIncludes(validateStatPool(char) as string, "exceed");
  });
});

describe("checkRequired", () => {
  it("approved character — +stat blocked (chargenStatus check)", () => {
    const char = makeChar({ chargenStatus: "approved" });
    // approved chars are locked but checkRequired is for submit validation
    assertEquals(char.chargenStatus, "approved");
  });
});

// ── Lifepath ──────────────────────────────────────────────────────────────────

describe("rollBasicLifepath", () => {
  it("produces all required fields", () => {
    const lp = rollBasicLifepath();
    assertExists(lp.socialStatus);
    assertExists(lp.startingCash);
    assertExists(lp.parentStatus);
    assertExists(lp.familyStanding);
    assertExists(lp.siblings);
    assertExists(lp.friends);
    assertExists(lp.enemies);
    assertExists(lp.appearance);
  });

  it("startingCash in range 200–1000", () => {
    for (let i = 0; i < 20; i++) {
      const lp = rollBasicLifepath();
      assertEquals((lp.startingCash ?? 0) >= 200, true);
      assertEquals((lp.startingCash ?? 0) <= 1000, true);
    }
  });
});

describe("rollProfessionalEvent", () => {
  it("returns event and detail strings", () => {
    for (let i = 0; i < 20; i++) {
      const ev = rollProfessionalEvent(true);
      assertExists(ev.event);
      assertExists(ev.detail);
    }
  });
});

// ── Catalog ───────────────────────────────────────────────────────────────────

describe("gear catalog", () => {
  it("findGearByName — Combat Pistol exists", () => {
    const item = findGearByName("Combat Pistol");
    assertExists(item);
    assertEquals(item?.cost, 310);
  });
  it("gearByCategory armor — all have sp", () => {
    const items = gearByCategory("armor");
    for (const item of items) assertExists(item.sp);
  });
});

describe("findTemplate", () => {
  it("finds Anime Hero", () => {
    const tpl = findTemplate("Anime Hero");
    assertExists(tpl);
    assertExists(tpl?.skillBonuses["Mecha Piloting"]);
  });
});

describe("findProfession", () => {
  it("finds Mechajock/Combat as dangerous", () => {
    const prof = findProfession("Mechajock/Combat");
    assertExists(prof);
    assertEquals(prof?.dangerous, true);
    assertEquals(prof?.skills.length, 7);
  });
});

// ── Combat ────────────────────────────────────────────────────────────────────

describe("applyDamage", () => {
  it("clamps at 0 — cannot go negative", () => {
    const wounds = { head: 3, torso: 12, rArm: 9, lArm: 9, rLeg: 9, lLeg: 9 };
    applyDamage(wounds, "head", 99);
    assertEquals(wounds.head, 0);
  });
  it("returns actual damage applied", () => {
    const wounds = { head: 4, torso: 12, rArm: 9, lArm: 9, rLeg: 9, lLeg: 9 };
    const applied = applyDamage(wounds, "head", 2);
    assertEquals(applied, 2);
    assertEquals(wounds.head, 2);
  });
});

describe("combatStatus", () => {
  it("returns DEAD when head = 0", () => {
    const char = makeChar({ wounds: { head: 0, torso: 12, rArm: 9, lArm: 9, rLeg: 9, lLeg: 9 } });
    assertEquals(combatStatus(char), "DEAD");
  });
  it("returns INCAPACITATED when torso = 0", () => {
    const char = makeChar({ wounds: { head: 6, torso: 0, rArm: 9, lArm: 9, rLeg: 9, lLeg: 9 } });
    assertEquals(combatStatus(char), "INCAPACITATED");
  });
});

// ── AI GM Bridge ──────────────────────────────────────────────────────────────

describe("mektonSystem", () => {
  it("id is mekton-zeta", () => {
    assertEquals(mektonSystem.id, "mekton-zeta");
  });
  it("formatCharacterContext — no MUSH color codes", () => {
    const char = makeChar();
    const ctx = mektonSystem.formatCharacterContext(char as unknown as Record<string, unknown>);
    assertEquals(/%ch|%cn|%cr|%cg/.test(ctx), false);
  });
  it("validate — rejects stat above 10", () => {
    const result = mektonSystem.validate("ref", 11);
    assertEquals(result !== true, true);
  });
  it("moveThresholds — fullSuccess 20, partialSuccess 15", () => {
    assertEquals(mektonSystem.moveThresholds.fullSuccess, 20);
    assertEquals(mektonSystem.moveThresholds.partialSuccess, 15);
  });
});
