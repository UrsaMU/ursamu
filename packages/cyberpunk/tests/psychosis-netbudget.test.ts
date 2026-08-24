/**
 * Tests — Cyberpsychosis penalties from humanity loss (not base EMP).
 */
import { assertEquals } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import {
  empLostToHumanity,
  getCyberpsychosisPenalty,
} from "../engine/cyberpsychosis.ts";

describe("getCyberpsychosisPenalty()", () => {
  it("HL 0 / natural EMP 4 — no penalty (not absolute EMP)", () => {
    assertEquals(getCyberpsychosisPenalty(4, "social", 4, 0), 0);
    assertEquals(getCyberpsychosisPenalty(4, "other", 4, 0), 0);
    assertEquals(getCyberpsychosisPenalty(6, "social", 6, 0), 0);
  });

  it("HL 0 even if stale emp is low — no penalty", () => {
    assertEquals(getCyberpsychosisPenalty(2, "other", 6, 0), 0);
  });

  it("no empBase — do not punish (legacy safe default)", () => {
    assertEquals(getCyberpsychosisPenalty(4, "social"), 0);
    assertEquals(getCyberpsychosisPenalty(6, "other"), 0);
  });

  it("lost 1 EMP (HL 10) — mild social -1", () => {
    assertEquals(getCyberpsychosisPenalty(5, "social", 6, 10), -1);
    assertEquals(getCyberpsychosisPenalty(5, "other", 6, 10), 0);
  });

  it("lost 2 EMP (HL 20) — moderate", () => {
    assertEquals(getCyberpsychosisPenalty(4, "social", 6, 20), -2);
    assertEquals(getCyberpsychosisPenalty(4, "other", 6, 20), -1);
  });

  it("lost 3+ EMP — severe", () => {
    assertEquals(getCyberpsychosisPenalty(3, "social", 6, 30), -4);
    assertEquals(getCyberpsychosisPenalty(3, "other", 6, 30), -2);
  });

  it("EMP 0 (full) — severe penalty", () => {
    assertEquals(getCyberpsychosisPenalty(0, "social", 6, 60), -4);
    assertEquals(getCyberpsychosisPenalty(0, "other", 6, 60), -2);
  });

  it("empLostToHumanity is HL-only", () => {
    assertEquals(empLostToHumanity(6, 6, 0), 0);
    assertEquals(empLostToHumanity(6, 6, 25), 2);
    assertEquals(empLostToHumanity(6, 3, 0), 0);
  });
});
