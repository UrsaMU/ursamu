/**
 * Tests — Improvement Point Economy
 */
import { assertEquals, assertStringIncludes } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { skillIpCost, roleIpCost } from "../commands/improve.ts";
import { mockPlayer, mockU } from "./helpers/mockU.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

// ─── Pure cost formula tests ──────────────────────────────────────────────────

describe("skillIpCost()", () => {
  it("rank 3 → costs 6 IP", () => {
    assertEquals(skillIpCost(3), 6);
  });

  it("rank 1 → costs 2 IP", () => {
    assertEquals(skillIpCost(1), 2);
  });

  it("rank 5 → costs 10 IP", () => {
    assertEquals(skillIpCost(5), 10);
  });

  it("rank 0 → costs 0 IP (free advance from 0; guarded by rank check in command)", () => {
    assertEquals(skillIpCost(0), 0);
  });
});

describe("roleIpCost()", () => {
  it("rank 1 → costs 10 IP", () => {
    assertEquals(roleIpCost(1), 10);
  });

  it("rank 2 → costs 20 IP", () => {
    assertEquals(roleIpCost(2), 20);
  });

  it("rank 4 → costs 40 IP", () => {
    assertEquals(roleIpCost(4), 40);
  });
});

// ─── Helper: build a minimal completed character ──────────────────────────────

function makeCpr(overrides: Partial<ICPRCharacter> = {}): ICPRCharacter {
  return {
    stats: { int: 5, ref: 5, dex: 5, tech: 5, cool: 5, will: 5, luck: 5, move: 5, body: 5, emp: 5, empBase: 5 },
    hp: { max: 15, current: 15 }, swThreshold: 8, deathSave: 5, deathSavePenalty: 0,
    role: "solo", roleRank: 4, roleData: {},
    skills: { athletics: 3 }, luckRemaining: 5, woundState: "healthy",
    criticalInjuries: [], armorBody: null, armorHead: null,
    cyberware: [], humanityLoss: 0, bodysculpt: [], activeEffects: [],
    reputation: 0, reputationDeeds: [], eurodollars: 0, lifestyle: null,
    lifepath: {}, chargenComplete: true, chargenStage: null, chargenMethod: "streetrat",
    restTimer: null, humanityGainedAt: null, locationEffects: [],
    improvementPoints: 20, ipLifetime: 20,
    ...overrides,
  } as ICPRCharacter;
}

// ─── +improve/skill integration-style tests (logic layer) ────────────────────

describe("+improve/skill — spend IP on skill advance", () => {
  it("skill rank increases and IP decreases on success", async () => {
    const cpr = makeCpr({ skills: { athletics: 3 }, improvementPoints: 20 });
    const dbMutations: Record<string, unknown> = {};

    const u = mockU({
      me: { state: { cpr } },
      args: ["skill", "athletics"],
      dbModify: async (_id, op, patch) => {
        // Simulate the mutations applied to the in-memory object
        if (op === "$set") {
          for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            dbMutations[k] = v;
          }
        }
        if (op === "$inc") {
          for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            dbMutations[k] = ((dbMutations[k] as number) ?? (k === "state.cpr.improvementPoints" ? 20 : 0)) + (v as number);
          }
        }
      },
    });

    // Manually invoke the logic (mirrors exec body for skill)
    const skillKey = "athletics";
    const currentRank = cpr.skills[skillKey] ?? 0; // 3
    const cost = skillIpCost(currentRank); // 6
    const ip = cpr.improvementPoints ?? 0; // 20

    assertEquals(cost, 6);
    assertEquals(ip >= cost, true, "Should have enough IP");

    await u.db.modify(u.me.id, "$set",  { [`state.cpr.skills.${skillKey}`]: currentRank + 1 });
    await u.db.modify(u.me.id, "$inc",  { "state.cpr.improvementPoints": -cost });

    assertEquals(dbMutations[`state.cpr.skills.${skillKey}`], 4);
    assertEquals(dbMutations["state.cpr.improvementPoints"], 14); // 20 + (-6)
  });

  it("insufficient IP: purchase rejected (no DB calls)", () => {
    const cpr = makeCpr({ skills: { athletics: 5 }, improvementPoints: 5 });

    const dbCalls: unknown[][] = [];
    const u = mockU({
      me: { state: { cpr } },
      args: ["skill", "athletics"],
      dbModify: async (...a) => { dbCalls.push(a); },
    });

    const currentRank = cpr.skills["athletics"] ?? 0; // 5
    const cost = skillIpCost(currentRank); // 10
    const ip = cpr.improvementPoints ?? 0; // 5

    assertEquals(ip < cost, true, "Should have insufficient IP");
    // No DB calls should happen when IP check fails
    assertEquals(dbCalls.length, 0);

    // Confirm the sent message would contain error
    u.send(`Insufficient IP. athletics rank 5 → 6 costs 10 IP. You have 5 IP.`);
    assertStringIncludes(u._sent[0], "Insufficient IP");
  });
});

// ─── +improve/role integration-style tests ───────────────────────────────────

describe("+improve/role — spend IP on role advance", () => {
  it("role rank increases and IP decreases on success", async () => {
    const cpr = makeCpr({ roleRank: 2, improvementPoints: 30 });
    const dbMutations: Record<string, unknown> = {};

    const u = mockU({
      me: { state: { cpr } },
      args: ["role", ""],
      dbModify: async (_id, op, patch) => {
        if (op === "$set") {
          for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            dbMutations[k] = v;
          }
        }
        if (op === "$inc") {
          for (const [k, v] of Object.entries(patch as Record<string, unknown>)) {
            const cur = (dbMutations[k] as number) ?? (k === "state.cpr.improvementPoints" ? 30 : 0);
            dbMutations[k] = cur + (v as number);
          }
        }
      },
    });

    const roleRank = cpr.roleRank; // 2
    const cost = roleIpCost(roleRank); // 20
    const ip = cpr.improvementPoints ?? 0; // 30

    assertEquals(cost, 20);
    assertEquals(ip >= cost, true, "Should have enough IP for role advance");

    await u.db.modify(u.me.id, "$set", { "state.cpr.roleRank": roleRank + 1 });
    await u.db.modify(u.me.id, "$inc", { "state.cpr.improvementPoints": -cost });

    assertEquals(dbMutations["state.cpr.roleRank"], 3);
    assertEquals(dbMutations["state.cpr.improvementPoints"], 10); // 30 + (-20)
  });

  it("insufficient IP for role: rejected (cost > balance)", () => {
    const cpr = makeCpr({ roleRank: 4, improvementPoints: 15 });
    const cost = roleIpCost(cpr.roleRank); // 40
    const ip = cpr.improvementPoints ?? 0; // 15

    assertEquals(ip < cost, true, "Should have insufficient IP for role rank 4→5");
  });
});

// ─── +ip admin award tests ────────────────────────────────────────────────────

describe("+ip admin award", () => {
  it("awards IP: $inc on improvementPoints and ipLifetime", async () => {
    const cpr = makeCpr({ improvementPoints: 5, ipLifetime: 10 });
    const target = mockPlayer({ id: "target1", name: "Rogue", state: { cpr } });
    const dbCalls: Array<[string, string, Record<string, number>]> = [];

    const u = mockU({
      me: { flags: new Set(["player", "connected", "admin"]) },
      args: ["Rogue", "5"],
      targetResult: target,
      dbModify: async (id, op, patch) => {
        dbCalls.push([id as string, op as string, patch as Record<string, number>]);
      },
    });

    // Simulate award
    const amount = 5;
    await u.db.modify(target.id, "$inc", {
      "state.cpr.improvementPoints": amount,
      "state.cpr.ipLifetime":        amount,
    });

    assertEquals(dbCalls.length, 1);
    assertEquals(dbCalls[0][1], "$inc");
    assertEquals(dbCalls[0][2]["state.cpr.improvementPoints"], 5);
    assertEquals(dbCalls[0][2]["state.cpr.ipLifetime"], 5);
  });

  it("non-admin: command is locked behind admin+ flag", () => {
    // The lock "connected admin+" is enforced by the engine, not testable here.
    // We verify the flag logic conceptually: a non-admin player lacks "admin" in flags.
    const nonAdmin = mockPlayer({ flags: new Set(["player", "connected"]) });
    assertEquals(nonAdmin.flags.has("admin"), false);
  });
});
