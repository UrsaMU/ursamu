import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { sheetExec, sheetSetExec, rollExec } from "../commands.ts";
import { defaultSheet, type CofdSheet } from "../cofd.ts";

const _OPTS_LEAK = { sanitizeResources: false, sanitizeOps: false };
describe("+sheet command", _OPTS_LEAK, () => {
  it("renders the character sheet correctly", async () => {
    const sheet = defaultSheet();
    sheet.concept = "Super Detective";
    
    const u = mockU({
      me: mockPlayer({
        name: "Arthur",
        state: { cofd: sheet }
      }),
      args: [""]
    });

    await sheetExec(u);
    assertStringIncludes(u._sent[0], "Arthur");
    assertStringIncludes(u._sent[0], "Super Detective");
  });

  it("handles non-existent target player gracefully", async () => {
    const u = mockU({
      args: ["UnknownPlayer"],
      targetResult: null
    });

    await sheetExec(u);
    assertStringIncludes(u._sent[0], "Player 'UnknownPlayer' not found");
  });
});

describe("+sheet/set command", () => {
  it("modifies trait and saves to database", async () => {
    const u = mockU({
      me: mockPlayer({
        id: "1",
        name: "Arthur",
        state: { cofd: defaultSheet() }
      }),
      args: ["Strength", "4"]
    });

    await sheetSetExec(u);
    assertStringIncludes(u._sent[0], "Set trait 'Strength' to '4'");
    assertEquals(u._dbCalls.length, 1);
    assertEquals(u._dbCalls[0][0], "1"); // ID of target
    assertEquals(u._dbCalls[0][1], "$set");
    // Verify strength is set in db call payload
    const savedSheet = (u._dbCalls[0][2] as Record<string, unknown>)[
      "data.cofd"
    ] as CofdSheet;
    assertEquals(savedSheet.attributes.strength, 4);
  });

  it("denies access if player does not have permission", async () => {
    const targetPlayer = mockPlayer({ id: "2", name: "Target", state: { cofd: defaultSheet() } });
    const u = mockU({
      args: ["Target/Strength", "4"],
      targetResult: targetPlayer,
      canEditResult: false
    });

    await sheetSetExec(u);
    assertStringIncludes(u._sent[0], "Permission denied");
    assertEquals(u._dbCalls.length, 0); // No DB changes
  });

  it("adds and clears specialties correctly", async () => {
    // 1. Add specialty
    const uAdd = mockU({
      me: mockPlayer({
        id: "1",
        name: "Arthur",
        state: { cofd: defaultSheet() }
      }),
      args: ["specialty/crafts", "Automotive"]
    });

    await sheetSetExec(uAdd);
    assertStringIncludes(uAdd._sent[0], "Added specialty 'Automotive' to skill 'crafts'");
    const addedSheet = (uAdd._dbCalls[0][2] as Record<string, unknown>)[
      "data.cofd"
    ] as CofdSheet;
    assertEquals(addedSheet.specialties.crafts, ["Automotive"]);

    // 2. Clear specialties
    const sheetWithSpec = defaultSheet();
    sheetWithSpec.specialties.crafts = ["Automotive"];
    const uClear = mockU({
      me: mockPlayer({
        id: "1",
        name: "Arthur",
        state: { cofd: sheetWithSpec }
      }),
      args: ["specialty/crafts", ""]
    });

    await sheetSetExec(uClear);
    assertStringIncludes(uClear._sent[0], "Cleared all specialties");
    const clearedSheet = (
      uClear._dbCalls[0][2] as Record<string, unknown>
    )["data.cofd"] as CofdSheet;
    assertEquals(clearedSheet.specialties.crafts.length, 0);
  });
});

describe("+roll command", () => {
  it("rolls simple expressions successfully", async () => {
    const u = mockU({
      args: ["", "Strength+Athletics"]
    });

    await rollExec(u);
    assertStringIncludes(u._sent[0], "ROLL>>");
    // Roller sees the compact form: attributes abbreviated, skills full,
    // e.g. "Str+Athletics".
    assertStringIncludes(u._sent[0], "Str");
    assertStringIncludes(u._sent[0].toLowerCase(), "athletics");
  });

  it("handles Willpower spend successfully", async () => {
    const sheet = defaultSheet();
    sheet.advantages.willpowerCurrent = 2;

    const u = mockU({
      me: mockPlayer({
        id: "1",
        name: "Arthur",
        state: { cofd: sheet }
      }),
      args: ["wp", "Strength+Athletics"]
    });

    await rollExec(u);
    // Compact form puts the WP token in the roll expression, not the verb suffix.
    assertStringIncludes(u._sent[0], "WP");
    // Should have updated database to spend 1 willpower
    assertEquals(u._dbCalls.length, 1);
    const updatedSheet = (u._dbCalls[0][2] as Record<string, unknown>)[
      "data.cofd"
    ] as CofdSheet;
    assertEquals(updatedSheet.advantages.willpowerCurrent, 1);
  });

  it("sends error message for empty/invalid expression", async () => {
    const u = mockU({
      args: ["", ""]
    });

    await rollExec(u);
    assertStringIncludes(u._sent[0], "Usage:");
  });
});
