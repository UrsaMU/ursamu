// Tests for +sheet/set size=<n> -- staff-only gate and derived-stat recompute.

import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import { sheetSetExec } from "../src/commands/sheet.ts";
import {
  defaultSheet,
  refreshAdvantages,
  setTrait,
  validateTraitValue,
  type CofdSheet,
} from "../src/stats/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+sheet/set size", OPTS, () => {
  it("rejects non-staff actor", async () => {
    const u = mockU({
      me: mockPlayer({
        id: "1",
        flags: new Set(["player", "connected"]),
        state: { cofd: defaultSheet() },
      }),
      args: ["size", "6"],
    });
    await sheetSetExec(u);
    assertEquals(u._dbCalls.length, 0);
    assertStringIncludes(u._sent[0], "Permission denied");
  });

  it("admin can set size", async () => {
    const u = mockU({
      me: mockPlayer({
        id: "1",
        flags: new Set(["player", "connected", "admin"]),
        state: { cofd: defaultSheet() },
      }),
      args: ["size", "6"],
    });
    await sheetSetExec(u);
    assertEquals(u._dbCalls.length, 1);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.advantages.size, 6);
  });

  it("builder can set size", async () => {
    const u = mockU({
      me: mockPlayer({
        id: "1",
        flags: new Set(["player", "connected", "builder"]),
        state: { cofd: defaultSheet() },
      }),
      args: ["size", "4"],
    });
    await sheetSetExec(u);
    const saved = (u._dbCalls[0][2] as Record<string, unknown>)["data.cofd"] as CofdSheet;
    assertEquals(saved.advantages.size, 4);
  });

  it("validates the 1..10 range", () => {
    let threw = false;
    try { validateTraitValue("size", "0"); } catch { threw = true; }
    assertEquals(threw, true);
    threw = false;
    try { validateTraitValue("size", "11"); } catch { threw = true; }
    assertEquals(threw, true);
    assertEquals(validateTraitValue("size", "10"), 10);
    assertEquals(validateTraitValue("size", "1"), 1);
  });
});

describe("Size derived-stat recompute", OPTS, () => {
  it("setTrait('size') recomputes via refreshAdvantages and clamps Health", () => {
    const s = defaultSheet();
    s.attributes.stamina = 3;
    s.advantages.size = 8;
    // Pre-fill the Health track to the old max (3+8=11).
    s.health = { bashing: 5, lethal: 5, aggravated: 1 };
    // Now drop Size to 4. New max = 3+4=7 -- track must clamp.
    const updated = setTrait(s, "size", 4);
    assertEquals(updated.advantages.size, 4);
    const total = (updated.health!.bashing) + (updated.health!.lethal) +
      (updated.health!.aggravated);
    assertEquals(total, 7);
  });

  it("refreshAdvantages alone clamps Health on Size change", () => {
    const s = defaultSheet();
    s.attributes.stamina = 2;
    s.advantages.size = 5;
    s.health = { bashing: 4, lethal: 3, aggravated: 0 }; // total 7 = max
    s.advantages.size = 3;
    const out = refreshAdvantages(s);
    const total = out.health!.bashing + out.health!.lethal + out.health!.aggravated;
    assertEquals(total, 5); // 2+3 stamina+size
  });
});

describe("Size sheet migration", OPTS, () => {
  it("defaults Size to 5 when missing", () => {
    // Hand-craft a partial old-shape sheet
    const old: Record<string, unknown> = {
      template: "mortal", concept: "", virtue: "", vice: "",
      attributes: { strength: 1, dexterity: 1, stamina: 1, intelligence: 1,
        wits: 1, resolve: 1, presence: 1, manipulation: 1, composure: 1 },
      skills: {}, specialties: {}, merits: {}, customFields: {}, powers: {},
      advantages: { willpowerMax: 2, willpowerCurrent: 2 }, // no size
    };
    const out = refreshAdvantages(old as unknown as CofdSheet);
    assertEquals(out.advantages.size, 5);
  });
});
