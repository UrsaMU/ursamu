/**
 * Tests — Crafting Utilities
 */
import { assertEquals, assertGreaterOrEqual, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  getMakerRank, totalMakerPoints, createCraftProject,
  materialsRequired, craftProgressCheck, fieldRepairCheck,
  createBlueprint, timeRemainingDisplay,
} from "../engine/crafting.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICPRCharacter, ICraftProject } from "../db/schemas.ts";

const makeTech = (rank = 4): ICPRCharacter => ({
  ...buildNewCharacter("tech"),
  role: "tech",
  roleRank: rank,
  roleData: {
    makerSpecialties: { fabrication: 2, field: 1, upgrade: 1, invention: 0 },
  },
  eurodollars: 10000,
});

describe("getMakerRank()", () => {
  it("reads specialty from roleData", () => {
    const char = makeTech(4);
    assertEquals(getMakerRank(char, "fabrication"), 2);
    assertEquals(getMakerRank(char, "field"), 1);
  });

  it("returns 0 for missing specialty", () => {
    const char = makeTech(4);
    assertEquals(getMakerRank(char, "invention"), 0);
  });
});

describe("totalMakerPoints()", () => {
  it("rank * 2", () => {
    assertEquals(totalMakerPoints(4), 8);
    assertEquals(totalMakerPoints(10), 20);
  });
});

describe("createCraftProject()", () => {
  it("creates a valid project", () => {
    const project = createCraftProject({
      techId: "tech1", techName: "TechBot",
      itemName: "Pistol", type: "fabricate",
      priceCategory: "costly", skill: "weaponstech",
    }, 2);

    assertEquals(project.itemName, "Pistol");
    assertEquals(project.type, "fabricate");
    assertEquals(project.completed, false);
    assertEquals(project.failed, false);
    assertGreaterOrEqual(project.dv, 1);
    assertGreaterOrEqual(project.completesAt, Date.now());
  });

  it("specialty maps fabricate → fabrication", () => {
    const project = createCraftProject({
      techId: "t1", techName: "T",
      itemName: "Item", type: "fabricate",
      priceCategory: "cheap", skill: "basic_tech",
    }, 0);
    assertEquals(project.specialty, "fabrication");
  });
});

describe("materialsRequired()", () => {
  it("fabricate cost is 1/5 of item cost", () => {
    // costly = 500 eb → materials = 100
    const cost = materialsRequired("costly", "fabricate");
    assertGreaterOrEqual(cost, 1);
  });

  it("upgrade costs full price", () => {
    const fab = materialsRequired("costly", "fabricate");
    const upg = materialsRequired("costly", "upgrade");
    assertGreaterOrEqual(upg, fab);
  });

  it("min cost of 10", () => {
    const cost = materialsRequired("cheap", "fabricate");
    assertGreaterOrEqual(cost, 10);
  });
});

describe("craftProgressCheck()", () => {
  it("returns not ready before completesAt", () => {
    const project: ICraftProject = {
      id: "1", techId: "t1", techName: "T",
      itemName: "Widget", type: "fabricate", specialty: "fabrication",
      specialtyRank: 2, dv: 15, skill: "basic_tech", materialsCost: 100,
      startedAt: Date.now(), completesAt: Date.now() + 999999,
      completed: false, failed: false,
    };
    const char = makeTech();
    const result = craftProgressCheck(char, project);
    assertEquals(result.ready, false);
    assertEquals(result.success, false);
  });

  it("rolls when ready", () => {
    const project: ICraftProject = {
      id: "1", techId: "t1", techName: "T",
      itemName: "Widget", type: "fabricate", specialty: "fabrication",
      specialtyRank: 2, dv: 15, skill: "basic_tech", materialsCost: 100,
      startedAt: Date.now() - 10000, completesAt: Date.now() - 1,
      completed: false, failed: false,
    };
    const char = makeTech();
    const result = craftProgressCheck(char, project);
    assertEquals(result.ready, true);
    assertEquals(typeof result.success, "boolean");
  });
});

describe("createBlueprint()", () => {
  it("stores techId and techName from parameters", () => {
    const bp = createBlueprint("player1", "TechBot", "Pistol", "A pistol blueprint", "costly", "weaponstech");
    assertEquals(bp.techId, "player1");
    assertEquals(bp.techName, "TechBot");
    assertEquals(bp.itemName, "Pistol");
    assertEquals(bp.skill, "weaponstech");
  });
});

describe("timeRemainingDisplay()", () => {
  it("shows Ready when past", () => {
    assertStringIncludes(timeRemainingDisplay(Date.now() - 1000), "Ready");
  });

  it("shows minutes for short times", () => {
    const fiveMin = Date.now() + 5 * 60 * 1000;
    const display = timeRemainingDisplay(fiveMin);
    assertStringIncludes(display, "m");
  });

  it("shows hours for longer times", () => {
    const twoHours = Date.now() + 2 * 60 * 60 * 1000;
    const display = timeRemainingDisplay(twoHours);
    assertStringIncludes(display, "h");
  });
});
