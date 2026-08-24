/**
 * Tests: resolveFacedown — CPR Core p.131 reputation facedown.
 */
import { assertEquals } from "jsr:@std/assert@1";
import { resolveFacedown, facedownTotal, isImpressedBy } from "../engine/combat.ts";

Deno.test("facedown: higher total wins", () => {
  const rolls = [5, 3]; // attacker rolls 5, defender rolls 3
  let i = 0;
  const fd = resolveFacedown(
    () => rolls[i++],
    { cool: 7, reputation: 3 },
    { cool: 5, reputation: 1 },
  );
  assertEquals(fd.outcome, "attacker");
  assertEquals(fd.attackerTotal, 15);
  assertEquals(fd.defenderTotal, 9);
  assertEquals(fd.rolls.length, 1);
});

Deno.test("facedown: tie re-rolls once", () => {
  // First pair ties (both 5 -> totals 10 vs 10). Second pair breaks it.
  const rolls = [5, 5, 8, 2];
  let i = 0;
  const fd = resolveFacedown(
    () => rolls[i++],
    { cool: 5, reputation: 0 },
    { cool: 5, reputation: 0 },
  );
  assertEquals(fd.outcome, "attacker");
  assertEquals(fd.rolls.length, 2);
  assertEquals(fd.attackerTotal, 13);
  assertEquals(fd.defenderTotal, 7);
});

Deno.test("facedown: second tie is a stalemate", () => {
  const rolls = [5, 5, 5, 5]; // both ties
  let i = 0;
  const fd = resolveFacedown(
    () => rolls[i++],
    { cool: 5, reputation: 0 },
    { cool: 5, reputation: 0 },
  );
  assertEquals(fd.outcome, "stalemate");
  assertEquals(fd.rolls.length, 2);
});

Deno.test("facedown: defender wins when total is higher", () => {
  const rolls = [2, 9];
  let i = 0;
  const fd = resolveFacedown(
    () => rolls[i++],
    { cool: 4, reputation: 0 },
    { cool: 6, reputation: 2 },
  );
  assertEquals(fd.outcome, "defender");
  assertEquals(fd.attackerTotal, 6);
  assertEquals(fd.defenderTotal, 17);
});

Deno.test("facedown: negative reputation hurts attacker", () => {
  assertEquals(facedownTotal(5, -3, 7), 9);
});

Deno.test("isImpressedBy: matches active condition by actor id", () => {
  const future = Date.now() + 60_000;
  assertEquals(isImpressedBy({ impressedBy: { actorId: "abc", expiresAt: future } }, "abc"), true);
  assertEquals(isImpressedBy({ impressedBy: { actorId: "abc", expiresAt: future } }, "xyz"), false);
});

Deno.test("isImpressedBy: expired conditions don't apply", () => {
  const past = Date.now() - 1000;
  assertEquals(isImpressedBy({ impressedBy: { actorId: "abc", expiresAt: past } }, "abc"), false);
});

Deno.test("isImpressedBy: null/undefined impressedBy returns false", () => {
  assertEquals(isImpressedBy({ impressedBy: null }, "abc"), false);
  assertEquals(isImpressedBy({}, "abc"), false);
});
