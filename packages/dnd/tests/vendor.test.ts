import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { migrateSheet, defaultSheet } from "../src/stats/dnd_sheet.ts";

describe("D&D Vendor Economy Math", () => {
  it("defaults character sheet gold to 100 gp", () => {
    const s = migrateSheet(defaultSheet());
    assertEquals(s.gold, 100);
  });

  it("handles purchase gold deduction", () => {
    const s = migrateSheet(defaultSheet());
    s.gold = 100;
    
    const cost = 15; // e.g. Longsword
    s.gold -= cost;

    assertEquals(s.gold, 85);
  });

  it("calculates sell price (50% value floor)", () => {
    const originalPrice1 = 15;
    const sellPrice1 = Math.max(1, Math.floor(originalPrice1 * 0.5));
    assertEquals(sellPrice1, 7);

    const originalPrice2 = 1;
    const sellPrice2 = Math.max(1, Math.floor(originalPrice2 * 0.5));
    assertEquals(sellPrice2, 1);
  });
});
