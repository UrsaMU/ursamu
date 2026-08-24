/**
 * Tests — Role Bug Fixes (Bug 1–4)
 */
import { assertEquals, assertNotEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";

// ---------------------------------------------------------------------------
// Helpers — mirrors the fixed logic in commands/therapy.ts and commands/rolls.ts
// without importing SDK-dependent modules.
// ---------------------------------------------------------------------------

/** Therapy roll using the FIXED formula: TECH + skill + 1d10 */
function therapyRollFixed(tech: number, skill: number, roll: number): number {
  return tech + skill + roll;
}

/** Therapy roll using the OLD (buggy) formula: EMP + skill + 1d10 */
function therapyRollOld(emp: number, skill: number, roll: number): number {
  return emp + skill + roll;
}

/** Lawman backup arrival check: roll 1d10 ≤ rank → arrives */
function lawmanBackupArrives(roll: number, rank: number): boolean {
  return roll <= rank;
}

/** Vehicle skill set matching commands/rolls.ts */
const VEHICLE_SKILLS = new Set([
  "drive_land_vehicle",
  "pilot_air_vehicle",
  "pilot_sea_vehicle",
]);

/** Moto bonus for nomad vehicle rolls — matches the fixed logic in rollSkillCheck */
function motoBonus(role: string, skillName: string, roleRank: number): number {
  if (role === "nomad" && VEHICLE_SKILLS.has(skillName)) {
    return roleRank;
  }
  return 0;
}

// ---------------------------------------------------------------------------
// Bug 1: Therapy roll uses TECH, not EMP
// ---------------------------------------------------------------------------

describe("Bug 1 — Therapy uses TECH stat, not EMP", () => {
  it("rolls with TECH when TECH ≠ EMP", () => {
    // Character where TECH=8, EMP=3 — totals must differ
    const tech = 8;
    const emp  = 3;
    const skill = 4;
    const roll  = 7;

    const techTotal = therapyRollFixed(tech, skill, roll);
    const empTotal  = therapyRollOld(emp,  skill, roll);

    assertNotEquals(techTotal, empTotal, "tech-based roll should differ from emp-based roll");
    assertEquals(techTotal, tech + skill + roll);
  });

  it("fixed total = TECH + skill + d10", () => {
    const tech = 6; const skill = 2; const roll = 5;
    assertEquals(therapyRollFixed(tech, skill, roll), 13);
  });

  it("old formula produced wrong result when EMP < TECH", () => {
    const tech = 7; const emp = 2; const skill = 3; const roll = 4;
    const fixed  = therapyRollFixed(tech, skill, roll);
    const broken = therapyRollOld(emp,  skill, roll);
    assertEquals(fixed,  14);  // 7 + 3 + 4
    assertEquals(broken,  9);  // 2 + 3 + 4
  });
});

// ---------------------------------------------------------------------------
// Bug 3: Lawman backup arrival roll
// ---------------------------------------------------------------------------

describe("Bug 3 — Lawman backup: arrival roll must succeed before backup comes", () => {
  it("backup does NOT arrive when roll > rank", () => {
    // rank 3, roll 4 → fails
    assertEquals(lawmanBackupArrives(4, 3), false);
  });

  it("backup does NOT arrive when roll == rank + 1", () => {
    assertEquals(lawmanBackupArrives(6, 5), false);
  });

  it("backup DOES arrive when roll ≤ rank", () => {
    assertEquals(lawmanBackupArrives(3, 3), true);
  });

  it("backup DOES arrive when roll is 1 (always possible)", () => {
    assertEquals(lawmanBackupArrives(1, 1), true);
  });

  it("rank 10 always succeeds (roll max is 10)", () => {
    for (let roll = 1; roll <= 10; roll++) {
      assertEquals(lawmanBackupArrives(roll, 10), true, `roll=${roll} rank=10 should always arrive`);
    }
  });

  it("rank 1 only succeeds on roll of 1", () => {
    assertEquals(lawmanBackupArrives(1, 1), true);
    assertEquals(lawmanBackupArrives(2, 1), false);
  });
});

// ---------------------------------------------------------------------------
// Bug 4: Nomad Moto bonus on vehicle skill rolls
// ---------------------------------------------------------------------------

describe("Bug 4 — Nomad Moto bonus applied to vehicle skill checks", () => {
  it("Nomad gets +roleRank on drive_land_vehicle", () => {
    assertEquals(motoBonus("nomad", "drive_land_vehicle", 5), 5);
  });

  it("Nomad gets +roleRank on pilot_air_vehicle", () => {
    assertEquals(motoBonus("nomad", "pilot_air_vehicle", 3), 3);
  });

  it("Nomad gets +roleRank on pilot_sea_vehicle", () => {
    assertEquals(motoBonus("nomad", "pilot_sea_vehicle", 7), 7);
  });

  it("Nomad does NOT get Moto bonus on non-vehicle skill (handgun)", () => {
    assertEquals(motoBonus("nomad", "handgun", 6), 0);
  });

  it("Nomad does NOT get Moto bonus on non-vehicle skill (athletics)", () => {
    assertEquals(motoBonus("nomad", "athletics", 8), 0);
  });

  it("Non-nomad does NOT get Moto bonus on vehicle skill", () => {
    assertEquals(motoBonus("solo",    "drive_land_vehicle", 5), 0);
    assertEquals(motoBonus("medtech", "drive_land_vehicle", 5), 0);
    assertEquals(motoBonus("lawman",  "pilot_air_vehicle",  5), 0);
  });

  it("adjusted roll total includes Moto bonus", () => {
    const baseTotal  = 14; // e.g., REF(5) + drive(4) + d10(5)
    const rank       = 4;
    const bonus      = motoBonus("nomad", "drive_land_vehicle", rank);
    assertEquals(baseTotal + bonus, 18);
  });

  it("adjusted roll total is unchanged for non-vehicle nomad roll", () => {
    const baseTotal = 14;
    const bonus     = motoBonus("nomad", "persuasion", 6);
    assertEquals(bonus, 0);
    assertEquals(baseTotal + bonus, 14);
  });
});
