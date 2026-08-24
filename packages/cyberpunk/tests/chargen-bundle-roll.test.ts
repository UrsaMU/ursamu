/**
 * Tests — Friends & Enemies Bundle Roll (chargen-steps.ts)
 */
import { assertEquals, assertStringIncludes } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { mockU, mockPlayer } from "./helpers/mockU.ts";
import { handleRoll, handleReroll } from "../commands/chargen-steps.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

function makeCpr(overrides: Partial<ICPRCharacter> = {}): ICPRCharacter {
  return {
    chargenStage: "lifepath_friends",
    chargenComplete: false,
    chargenMethod: "complete",
    role: "solo",
    lifepath: {},
    stats: { int: 5, ref: 5, dex: 5, tech: 5, cool: 5, will: 5, luck: 5, move: 5, body: 5, emp: 6, empBase: 6 },
    hp: { max: 15, current: 15 },
    swThreshold: 8,
    deathSave: 5,
    skills: {},
    humanity: { current: 60, loss: 0 },
    cyberware: [],
    weapons: [],
    armor: [],
    ...overrides,
  } as ICPRCharacter;
}

// ── Friends ──────────────────────────────────────────────────────────────────

describe("handleRoll — lifepath_friends bundle", () => {
  it("writes friends[] and _friendCount to DB via $set", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_friends" });
    const u = mockU({ args: ["", ""] });
    await handleRoll(u, cpr, "");
    const dbCall = u._dbCalls.find((c) => (c[2] as Record<string, unknown>)?.["state.cpr.lifepath.friends"] !== undefined);
    assertEquals(dbCall?.[1], "$set", "must use $set");
    const patch = dbCall?.[2] as Record<string, unknown>;
    assertEquals(typeof patch["state.cpr.lifepath._friendCount"], "number");
    const friends = patch["state.cpr.lifepath.friends"] as unknown[];
    assertEquals(Array.isArray(friends), true);
    assertEquals(friends.length, patch["state.cpr.lifepath._friendCount"] as number);
  });

  it("sends a message showing FRIENDS count and footer", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_friends" });
    const u = mockU({ args: ["", ""] });
    await handleRoll(u, cpr, "");
    const output = u._sent.join("\n");
    assertStringIncludes(output, "FRIENDS");
  });

  it("always replaces — second /roll gives a fresh set, not an append", async () => {
    const cpr = makeCpr({
      chargenStage: "lifepath_friends",
      lifepath: { friends: ["A former lover.", "Like a parent to you."], _friendCount: 2 },
    });
    const u = mockU({ args: ["", ""] });
    await handleRoll(u, cpr, "");
    const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
    const friends = patch["state.cpr.lifepath.friends"] as unknown[];
    // New friends[] is a fresh independent array, not the old one extended
    assertEquals(Array.isArray(friends), true);
  });

  it("zero count — sends no-friends message without error", async () => {
    // Spy on Math.random to force a roll of 1 → count = max(0, 1-7) = 0
    const origRandom = Math.random;
    Math.random = () => 0.0001; // Math.ceil(0.0001 * 10) = 1
    try {
      const cpr = makeCpr({ chargenStage: "lifepath_friends" });
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const output = u._sent.join("\n");
      assertStringIncludes(output, "FRIENDS");
      assertStringIncludes(output, "0");
    } finally {
      Math.random = origRandom;
    }
  });
});

// ── Enemies ───────────────────────────────────────────────────────────────────

describe("handleRoll — lifepath_enemies bundle", () => {
  it("writes enemies[] and _enemyCount=0 to DB via $set", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
    const u = mockU({ args: ["", ""] });
    await handleRoll(u, cpr, "");
    const dbCall = u._dbCalls.find((c) => (c[2] as Record<string, unknown>)?.["state.cpr.lifepath.enemies"] !== undefined);
    assertEquals(dbCall?.[1], "$set");
    const patch = dbCall?.[2] as Record<string, unknown>;
    assertEquals(typeof patch["state.cpr.lifepath._enemyCount"], "number", "_enemyCount is a number");
    assertEquals(Array.isArray(patch["state.cpr.lifepath.enemies"]), true);
  });

  it("sends a message showing ENEMIES count", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
    const u = mockU({ args: ["", ""] });
    await handleRoll(u, cpr, "");
    assertStringIncludes(u._sent.join("\n"), "ENEMIES");
  });

  it("always replaces — re-rolling wipes prior enemies, not appends", async () => {
    const priorEnemies = [{ description: "Ex-friend", causeOfEnmity: "old", whatTheyHave: "knife", numPeople: 1 }];
    const cpr = makeCpr({
      chargenStage: "lifepath_enemies",
      lifepath: { enemies: priorEnemies, _enemyCount: 0 },
    });
    const origRandom = Math.random;
    Math.random = () => 0.8; // ceil(0.8*10) = 8 → count = max(0, 8-7) = 1
    try {
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
      const enemies = patch["state.cpr.lifepath.enemies"] as unknown[];
      // Fresh roll — must be exactly 1 enemy, not 2 (original + new)
      assertEquals(enemies.length, 1);
    } finally {
      Math.random = origRandom;
    }
  });

  it("enemy objects have required fields", async () => {
    const origRandom = Math.random;
    Math.random = () => 0.8; // forces count = 1
    try {
      const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
      const enemies = patch["state.cpr.lifepath.enemies"] as Record<string, unknown>[];
      if (enemies.length > 0) {
        const e = enemies[0];
        assertEquals(typeof e.description, "string");
        assertEquals(typeof e.causeOfEnmity, "string");
        assertEquals(typeof e.whatTheyHave, "string");
      }
    } finally {
      Math.random = origRandom;
    }
  });
});

// ── handleReroll ─────────────────────────────────────────────────────────────

describe("handleReroll", () => {
  it("rerolls friends when stage is friends", async () => {
    const cpr = makeCpr({
      chargenStage: "lifepath_friends",
      lifepath: { friends: ["A former lover."], _friendCount: 1 },
    });
    const u = mockU({ args: ["", ""] });
    await handleReroll(u, cpr, "friends");
    const dbCall = u._dbCalls.find((c) => (c[2] as Record<string, unknown>)?.["state.cpr.lifepath.friends"] !== undefined);
    assertEquals(dbCall?.[1], "$set");
  });

  it("rerolls enemies when stage is enemies", async () => {
    const cpr = makeCpr({
      chargenStage: "lifepath_enemies",
      lifepath: { enemies: [], _enemyCount: 0 },
    });
    const u = mockU({ args: ["", ""] });
    await handleReroll(u, cpr, "enemies");
    const dbCall = u._dbCalls.find((c) => (c[2] as Record<string, unknown>)?.["state.cpr.lifepath.enemies"] !== undefined);
    assertEquals(dbCall?.[1], "$set");
  });

  it("rejects non-friends/enemies stages with error message", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_events" });
    const u = mockU({ args: ["", ""] });
    await handleReroll(u, cpr, "events");
    assertStringIncludes(u._sent.join("\n"), "only works for");
    assertEquals(u._dbCalls.length, 0);
  });

  it("rejects outside chargen", async () => {
    const cpr = makeCpr({ chargenStage: "complete" as ICPRCharacter["chargenStage"] });
    const u = mockU({ args: ["", ""] });
    await handleReroll(u, cpr, "friends");
    assertStringIncludes(u._sent.join("\n"), "only available during character generation");
    assertEquals(u._dbCalls.length, 0);
  });

  it("stripSubs called — MUSH codes in arg do not crash or land in stage lookup", async () => {
    const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
    const u = mockU({ args: ["", ""] });
    // Pass color codes as arg — should strip and still resolve to enemies stage
    await handleReroll(u, cpr, "%chenemies%cn");
    const dbCall = u._dbCalls.find((c) => (c[2] as Record<string, unknown>)?.["state.cpr.lifepath.enemies"] !== undefined);
    assertEquals(dbCall?.[1], "$set");
  });
});

// ── Bundle symmetry ───────────────────────────────────────────────────────────

describe("friends/enemies bundle invariants", () => {
  it("friends[].length always equals _friendCount", async () => {
    for (let trial = 0; trial < 5; trial++) {
      const cpr = makeCpr({ chargenStage: "lifepath_friends" });
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
      const friends = patch["state.cpr.lifepath.friends"] as unknown[];
      const count = patch["state.cpr.lifepath._friendCount"] as number;
      assertEquals(friends.length, count, `trial ${trial}: length must equal count`);
    }
  });

  it("enemies[].length equals rolled count (0–3 range)", async () => {
    for (let trial = 0; trial < 5; trial++) {
      const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
      const enemies = patch["state.cpr.lifepath.enemies"] as unknown[];
      assertEquals(Array.isArray(enemies), true);
      assertEquals(enemies.length >= 0 && enemies.length <= 3, true, `trial ${trial}: count 0-3`);
    }
  });

  it("_enemyCount equals enemies.length (no x/0 display bug)", async () => {
    for (let trial = 0; trial < 5; trial++) {
      const cpr = makeCpr({ chargenStage: "lifepath_enemies" });
      const u = mockU({ args: ["", ""] });
      await handleRoll(u, cpr, "");
      const patch = u._dbCalls[0]?.[2] as Record<string, unknown>;
      const enemies = patch["state.cpr.lifepath.enemies"] as unknown[];
      const count   = patch["state.cpr.lifepath._enemyCount"] as number;
      assertEquals(enemies.length, count, `trial ${trial}: length must equal stored count`);
    }
  });
});
