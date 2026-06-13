// Tests for +sheet/virtue, /vice, /rest -- Willpower regeneration.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import {
  sheetRestExec,
  sheetViceExec,
  sheetVirtueExec,
} from "../src/commands/sheet.ts";
import { defaultSheet, type CofdSheet } from "../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function sheetWithWP(cur: number, max: number): CofdSheet {
  const s = defaultSheet();
  s.advantages.willpowerMax = max;
  s.advantages.willpowerCurrent = cur;
  return s;
}

describe("+sheet/virtue", OPTS, () => {
  it("restores Willpower to max for self", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(1, 6) } }),
      args: ["virtue", ""],
    });
    await sheetVirtueExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.advantages.willpowerCurrent, 6);
    assertStringIncludes(u._sent[0], "Virtue triggered");
    assertStringIncludes(u._sent[0], "6/6");
  });

  it("no-ops when already at max", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(6, 6) } }),
      args: ["virtue", ""],
    });
    await sheetVirtueExec(u);
    assertEquals(u._dbCalls.length, 0);
    assertStringIncludes(u._sent[0], "already has full Willpower");
  });

  it("denies cross-player without canEdit", async () => {
    const target = mockPlayer({ id: "2", name: "Marcus", state: { cofd: sheetWithWP(0, 5) } });
    const u = mockU({
      args: ["virtue", "Marcus"],
      targetResult: target,
      canEditResult: false,
    });
    await sheetVirtueExec(u);
    assertEquals(u._dbCalls.length, 0);
    assertStringIncludes(u._sent[0], "Permission denied");
  });

  it("strips %c color codes from the reason argument before persisting", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(1, 4) } }),
      args: ["virtue", "= %cr%chHostile Reason%cn"],
    });
    await sheetVirtueExec(u);
    // stripSubs removes the color codes; reason text remains in the output.
    const out = u._sent.join(" ");
    assertEquals(out.includes("%cr"), false);
    assertEquals(out.includes("%cn"), false);
  });
});

describe("+sheet/vice", OPTS, () => {
  it("adds exactly 1 Willpower", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(2, 6) } }),
      args: ["vice", "= one too many"],
    });
    await sheetViceExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.advantages.willpowerCurrent, 3);
    assertStringIncludes(u._sent[0], "Vice indulged");
    assertStringIncludes(u._sent[0], "3/6");
  });

  it("clamps at max", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(5, 5) } }),
      args: ["vice", ""],
    });
    await sheetViceExec(u);
    assertEquals(u._dbCalls.length, 0);
    assertStringIncludes(u._sent[0], "already has full Willpower");
  });
});

describe("+sheet/rest", OPTS, () => {
  it("restores Willpower to max", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(0, 7) } }),
      args: ["rest", ""],
    });
    await sheetRestExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.advantages.willpowerCurrent, 7);
    assertStringIncludes(u._sent[0], "Full rest");
  });

  it("uses $set on data.cofd path", async () => {
    const u = mockU({
      me: mockPlayer({ id: "1", state: { cofd: sheetWithWP(0, 5) } }),
      args: ["rest", ""],
    });
    await sheetRestExec(u);
    assertEquals(u._dbCalls[0][1], "$set");
    assertEquals(Object.keys(u._dbCalls[0][2] as Record<string, unknown>)[0], "data.cofd");
  });
});
