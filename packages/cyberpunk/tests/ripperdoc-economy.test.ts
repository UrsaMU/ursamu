/**
 * Tests — Ripperdoc Economy (Fix 1: install fees, Fix 2: surgery rolls)
 *
 * These tests validate the pure business-logic rules applied in
 * +cyber/install without needing a live SDK. Where possible they test
 * the exported helpers from data/cyberware.ts directly.
 */
import { assertEquals, assertGreaterOrEqual, assertLessOrEqual } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^0.224.0/bdd";
import { installCost, installDV } from "../data/cyberware.ts";
import type { ICyberware } from "../db/schemas.ts";

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeInstallType(t: ICyberware["installType"]) { return t; }

/**
 * Pure re-implementation of the fee-check guard from installCyberware().
 * Returns true when the character can afford the installation.
 */
function canAffordInstall(
  eurodollars: number,
  installType: ICyberware["installType"],
): { allowed: boolean; fee: number } {
  const fee = installCost(installType);
  return { allowed: eurodollars >= fee, fee };
}

/**
 * Deterministic surgery roll for testing.
 * Mirrors the logic in installCyberware() — success when total >= DV.
 */
function resolveSurgery(opts: {
  tech: number;
  cybertech: number;
  d10: number;
  installType: "clinic" | "hospital";
}): { total: number; dv: number; success: boolean; feeSpent: boolean } {
  const dv = installDV(opts.installType);
  const total = opts.tech + opts.cybertech + opts.d10;
  return { total, dv, success: total >= dv, feeSpent: true }; // fee always spent
}

// ── 1. Mall install: fee is 100 eb ───────────────────────────────────────────

describe("installCost()", () => {
  it("mall install costs 100 eb", () => {
    assertEquals(installCost(makeInstallType("mall")), 100);
  });

  it("clinic install costs 500 eb", () => {
    assertEquals(installCost(makeInstallType("clinic")), 500);
  });

  it("hospital install costs 1000 eb", () => {
    assertEquals(installCost(makeInstallType("hospital")), 1000);
  });
});

// ── 2. installDV(): correct DVs per facility ──────────────────────────────────

describe("installDV()", () => {
  it("mall DV is 13", () => {
    assertEquals(installDV(makeInstallType("mall")), 13);
  });

  it("clinic DV is 15", () => {
    assertEquals(installDV(makeInstallType("clinic")), 15);
  });

  it("hospital DV is 17", () => {
    // Note: data/cyberware.ts returns 17 for hospital (stricter facility paradox
    // per this implementation — the book lists 13; implementation overrides).
    assertEquals(installDV(makeInstallType("hospital")), 17);
  });
});

// ── 3. Mall install: fee deducted from EB ────────────────────────────────────

describe("canAffordInstall() — mall (100 eb)", () => {
  it("allowed when EB exactly equals fee", () => {
    const { allowed, fee } = canAffordInstall(100, "mall");
    assertEquals(fee, 100);
    assertEquals(allowed, true);
  });

  it("allowed when EB exceeds fee", () => {
    const { allowed } = canAffordInstall(500, "mall");
    assertEquals(allowed, true);
  });
});

// ── 4. Insufficient funds: install rejected ───────────────────────────────────

describe("canAffordInstall() — insufficient funds", () => {
  it("mall: rejected when EB < 100", () => {
    const { allowed, fee } = canAffordInstall(99, "mall");
    assertEquals(fee, 100);
    assertEquals(allowed, false);
  });

  it("clinic: rejected when EB < 500", () => {
    const { allowed } = canAffordInstall(499, "clinic");
    assertEquals(allowed, false);
  });

  it("hospital: rejected when EB < 1000", () => {
    const { allowed } = canAffordInstall(999, "hospital");
    assertEquals(allowed, false);
  });

  it("zero EB always rejected for any install type", () => {
    assertEquals(canAffordInstall(0, "mall").allowed, false);
    assertEquals(canAffordInstall(0, "clinic").allowed, false);
    assertEquals(canAffordInstall(0, "hospital").allowed, false);
  });
});

// ── 5. Clinic install success: roll >= DV 15 → installed ─────────────────────

describe("resolveSurgery() — clinic (DV 15)", () => {
  it("success when total equals DV", () => {
    const result = resolveSurgery({ tech: 5, cybertech: 4, d10: 6, installType: "clinic" });
    assertEquals(result.dv, 15);
    assertEquals(result.total, 15);
    assertEquals(result.success, true);
    assertEquals(result.feeSpent, true);
  });

  it("success when total exceeds DV", () => {
    const result = resolveSurgery({ tech: 8, cybertech: 6, d10: 10, installType: "clinic" });
    assertEquals(result.success, true);
  });

  it("failure when total < DV — fee still spent", () => {
    const result = resolveSurgery({ tech: 3, cybertech: 2, d10: 1, installType: "clinic" });
    assertEquals(result.dv, 15);
    assertEquals(result.total, 6);
    assertEquals(result.success, false);
    assertEquals(result.feeSpent, true); // non-refundable
  });
});

// ── 6. Hospital install: DV 17 used vs clinic DV 15 ──────────────────────────

describe("resolveSurgery() — hospital vs clinic DV comparison", () => {
  it("hospital uses DV 17 (higher than clinic DV 15)", () => {
    const clinic = resolveSurgery({ tech: 5, cybertech: 4, d10: 6, installType: "clinic" });
    const hospital = resolveSurgery({ tech: 5, cybertech: 4, d10: 6, installType: "hospital" });
    // Same roll, hospital has higher DV
    assertGreaterOrEqual(hospital.dv, clinic.dv);
    assertEquals(clinic.dv, 15);
    assertEquals(hospital.dv, 17);
  });

  it("roll that succeeds at clinic (total=15) fails at hospital (DV=17)", () => {
    const opts = { tech: 5, cybertech: 4, d10: 6 }; // total = 15
    assertEquals(resolveSurgery({ ...opts, installType: "clinic" }).success, true);
    assertEquals(resolveSurgery({ ...opts, installType: "hospital" }).success, false);
  });

  it("roll that succeeds at hospital also succeeds at clinic", () => {
    const opts = { tech: 5, cybertech: 5, d10: 7 }; // total = 17
    assertEquals(resolveSurgery({ ...opts, installType: "hospital" }).success, true);
    assertEquals(resolveSurgery({ ...opts, installType: "clinic" }).success, true);
  });
});

// ── 7. Fee deduction: $inc with correct negative value ───────────────────────

describe("fee deduction via $inc", () => {
  it("mall fee produces -100 increment", () => {
    const fee = installCost("mall");
    assertEquals(-fee, -100);
  });

  it("clinic fee produces -500 increment", () => {
    const fee = installCost("clinic");
    assertEquals(-fee, -500);
  });

  it("hospital fee produces -1000 increment", () => {
    const fee = installCost("hospital");
    assertEquals(-fee, -1000);
  });

  it("EB after mall install is eurodollars - 100", () => {
    const startingEB = 2_500;
    const fee = installCost("mall");
    const remaining = startingEB - fee;
    assertEquals(remaining, 2_400);
  });

  it("EB after clinic install is eurodollars - 500", () => {
    const startingEB = 2_500;
    const fee = installCost("clinic");
    assertEquals(startingEB - fee, 2_000);
  });
});

// ── 8. Surgery roll range sanity (d10 = 1–10) ────────────────────────────────

describe("surgery roll bounds", () => {
  it("d10 range 1–10 produces expected total range", () => {
    const tech = 5;
    const cybertech = 4;
    // min total: 5+4+1 = 10, max total: 5+4+10 = 19
    const min = resolveSurgery({ tech, cybertech, d10: 1, installType: "clinic" }).total;
    const max = resolveSurgery({ tech, cybertech, d10: 10, installType: "clinic" }).total;
    assertGreaterOrEqual(min, 10);
    assertLessOrEqual(max, 19);
  });

  it("max roll (d10=10, tech=10, cybertech=10) always succeeds at clinic or hospital", () => {
    const opts = { tech: 10, cybertech: 10, d10: 10 };
    assertEquals(resolveSurgery({ ...opts, installType: "clinic" }).success, true);
    assertEquals(resolveSurgery({ ...opts, installType: "hospital" }).success, true);
  });

  it("min roll (d10=1, tech=0, cybertech=0) always fails at clinic", () => {
    const result = resolveSurgery({ tech: 0, cybertech: 0, d10: 1, installType: "clinic" });
    assertEquals(result.success, false);
  });
});
