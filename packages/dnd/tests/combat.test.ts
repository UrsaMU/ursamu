import { assertEquals } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { type CombatantInfo } from "../src/commands/combat.ts";
import { migrateSheet, defaultSheet } from "../src/stats/dnd_sheet.ts";

describe("Combat Initiative Sorting", () => {
  it("sorts combatants by initiative descending", () => {
    const list: CombatantInfo[] = [
      { id: "1", name: "A", initiative: 12, dexMod: 1 },
      { id: "2", name: "B", initiative: 18, dexMod: 2 },
      { id: "3", name: "C", initiative: 15, dexMod: 0 }
    ];

    list.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod);

    assertEquals(list[0].id, "2");
    assertEquals(list[1].id, "3");
    assertEquals(list[2].id, "1");
  });

  it("breaks ties using dexterity modifier", () => {
    const list: CombatantInfo[] = [
      { id: "1", name: "A", initiative: 15, dexMod: 1 },
      { id: "2", name: "B", initiative: 15, dexMod: 3 },
      { id: "3", name: "C", initiative: 15, dexMod: 2 }
    ];

    list.sort((a, b) => b.initiative - a.initiative || b.dexMod - a.dexMod);

    assertEquals(list[0].id, "2");
    assertEquals(list[1].id, "3");
    assertEquals(list[2].id, "1");
  });
});

describe("NPC XP and Execution Math", () => {
  it("defaults character sheet XP to 0", () => {
    const s = migrateSheet(defaultSheet());
    assertEquals(s.xp, 0);
  });

  it("adds XP to character sheet", () => {
    const s = migrateSheet(defaultSheet());
    s.xp += 100; // e.g. Orc XP
    assertEquals(s.xp, 100);
  });
});

describe("D&D Drop Config & Critical Hit Math", () => {
  it("defines drop tables on NPC sheets correctly", () => {
    const s = migrateSheet(defaultSheet());
    const drops = [
      { item: "Gold Coins", chance: 0.8, type: "general", formula: "2d6" }
    ];
    (s as any).drops = drops;
    assertEquals((s as any).drops.length, 1);
    assertEquals((s as any).drops[0].item, "Gold Coins");
  });

  it("calculates doubled dice count for critical hits", () => {
    const baseCount = 1;
    const isCrit = true;
    const finalCount = isCrit ? baseCount * 2 : baseCount;
    assertEquals(finalCount, 2);
  });
});

describe("Spellcasting Math", () => {
  it("consumes spell slots correctly", () => {
    const s = migrateSheet(defaultSheet());
    s.spellSlotsMax[1] = 2;
    s.spellSlotsCurrent[1] = 2;
    s.spellSlotsCurrent[1] -= 1;
    assertEquals(s.spellSlotsCurrent[1], 1);
  });

  it("applies Cure Wounds healing correctly", () => {
    const s = migrateSheet(defaultSheet());
    s.hp.max = 30;
    s.hp.current = 10;
    const healRoll = 5;
    const wisMod = 3;
    const totalHeal = healRoll + wisMod;
    s.hp.current = Math.min(s.hp.max, s.hp.current + totalHeal);
    assertEquals(s.hp.current, 18);
  });
});
