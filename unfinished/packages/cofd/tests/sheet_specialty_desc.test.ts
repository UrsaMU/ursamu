// Tests for specialty descriptions: "<name>: <description>" syntax,
// rename preservation, migration safety, and renderer inline display.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { sheetSetExec } from "../src/commands/sheet.ts";
import {
  defaultSheet,
  migrateSheet,
  type CofdSheet,
} from "../src/stats/index.ts";
import { skillsSection } from "../src/sheet/sections/skills.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+sheet/set specialty -- description", OPTS, () => {
  it("parses 'name: description' and stores both", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: defaultSheet() } }),
      args: ["specialty/brawl", "Boxing: southpaw stance"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.specialties.brawl, ["Boxing"]);
    assertEquals(saved.specialtyDescriptions!.brawl.Boxing, "southpaw stance");
    assertStringIncludes(u._sent[0], "Added specialty 'Boxing' (southpaw stance)");
  });

  it("name without ': desc' stores empty description (legacy shape)", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: defaultSheet() } }),
      args: ["specialty/brawl", "Boxing"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.specialties.brawl, ["Boxing"]);
    assertEquals(saved.specialtyDescriptions!.brawl.Boxing, undefined);
  });

  it("re-adding the same name without separator preserves description", async () => {
    const sheet = defaultSheet();
    sheet.specialties.brawl = ["Boxing"];
    sheet.specialtyDescriptions = { brawl: { Boxing: "southpaw stance" } };
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheet } }),
      args: ["specialty/brawl", "Boxing"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.specialtyDescriptions!.brawl.Boxing, "southpaw stance");
  });

  it("re-adding with new description replaces", async () => {
    const sheet = defaultSheet();
    sheet.specialties.brawl = ["Boxing"];
    sheet.specialtyDescriptions = { brawl: { Boxing: "southpaw stance" } };
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheet } }),
      args: ["specialty/brawl", "Boxing: orthodox stance"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.specialtyDescriptions!.brawl.Boxing, "orthodox stance");
  });

  it("clearing all specialties wipes descriptions too", async () => {
    const sheet = defaultSheet();
    sheet.specialties.brawl = ["Boxing"];
    sheet.specialtyDescriptions = { brawl: { Boxing: "southpaw stance" } };
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheet } }),
      args: ["specialty/brawl", ""],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.specialties.brawl, []);
    assertEquals(saved.specialtyDescriptions!.brawl, {});
  });

  it("rejects descriptions over 80 chars", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: defaultSheet() } }),
      args: ["specialty/brawl", "Boxing: " + "x".repeat(81)],
    });
    await sheetSetExec(u);
    assertEquals(u._dbCalls.length, 0);
    assertStringIncludes(u._sent[0], "description too long");
  });

  it("strips %c codes from name and description before storage", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: defaultSheet() } }),
      args: ["specialty/brawl", "%cgBoxing%cn: %crFAKE%cn focus"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    // Color codes scrubbed; only sanitized strings remain.
    assertEquals(saved.specialties.brawl[0].includes("%c"), false);
    const desc = saved.specialtyDescriptions!.brawl[saved.specialties.brawl[0]] ?? "";
    assertEquals(desc.includes("%c"), false);
  });
});

describe("Specialty migration", OPTS, () => {
  it("old sheets without specialtyDescriptions migrate to empty map", () => {
    const old: Record<string, unknown> = {
      template: "mortal", concept: "", virtue: "", vice: "",
      attributes: { strength: 1, dexterity: 1, stamina: 1, intelligence: 1,
        wits: 1, resolve: 1, presence: 1, manipulation: 1, composure: 1 },
      skills: {},
      specialties: { brawl: ["Boxing"] },
      merits: {}, customFields: {}, powers: {},
      advantages: { willpowerMax: 2, willpowerCurrent: 2, size: 5 },
    };
    const out = migrateSheet(old);
    assertEquals(out.specialties.brawl, ["Boxing"]);
    assertEquals(out.specialtyDescriptions, {});
  });
});

describe("Specialty renderer", OPTS, () => {
  it("renders description inline in parentheses", async () => {
    const sheet = defaultSheet();
    sheet.skills.brawl = 3;
    sheet.specialties.brawl = ["Boxing"];
    sheet.specialtyDescriptions = { brawl: { Boxing: "southpaw" } };
    const lines = await skillsSection.render({
      sheet,
      template: { customFields: [] } as unknown as Parameters<typeof skillsSection.render>[0]["template"],
      playerName: "Test",
      actorId: "1",
      width: 78,
      // u optional -- skills section does not need it
    } as unknown as Parameters<typeof skillsSection.render>[0]);
    const joined = lines.join("\n");
    assertStringIncludes(joined, "Boxing (southpaw)");
  });

  it("renders without parens when no description", async () => {
    const sheet = defaultSheet();
    sheet.skills.brawl = 3;
    sheet.specialties.brawl = ["Boxing"];
    const lines = await skillsSection.render({
      sheet,
      template: { customFields: [] } as unknown as Parameters<typeof skillsSection.render>[0]["template"],
      playerName: "Test",
      actorId: "1",
      width: 78,
    } as unknown as Parameters<typeof skillsSection.render>[0]);
    const joined = lines.join("\n");
    assertStringIncludes(joined, "Boxing");
    assertEquals(joined.includes("Boxing ("), false);
  });
});
