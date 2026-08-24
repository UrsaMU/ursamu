/**
 * Tests -- Stun Pool / Non-Lethal Damage (engine/stun.ts)
 */
import { assertEquals, assert } from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import {
  applyStunDamage,
  ensureStunPool,
  isUnconscious,
  recoverStun,
  calcMaxStun,
} from "../engine/stun.ts";
import { buildNewCharacter } from "../engine/character.ts";
import type { ICPRCharacter } from "../db/schemas.ts";

function makeChar(): ICPRCharacter {
  return buildNewCharacter("solo");
}

describe("ensureStunPool()", () => {
  it("lazy-initializes stun pool on legacy chars (no stun field)", () => {
    const c = makeChar();
    assertEquals(c.stun, undefined);
    const out = ensureStunPool(c);
    assertEquals(out.stun!.max, calcMaxStun(c));
    assertEquals(out.stun!.current, out.stun!.max);
  });

  it("is a no-op if stun already present", () => {
    const c = ensureStunPool(makeChar());
    const again = ensureStunPool(c);
    assertEquals(again.stun, c.stun);
  });

  it("does not mutate the input character", () => {
    const c = makeChar();
    ensureStunPool(c);
    assertEquals(c.stun, undefined);
  });
});

describe("applyStunDamage()", () => {
  it("decreases stun.current by amount", () => {
    const c = ensureStunPool(makeChar());
    const before = c.stun!.current;
    const { char } = applyStunDamage(c, 5);
    assertEquals(char.stun!.current, before - 5);
  });

  it("knocks out at 0 and reports knockedOut=true on the lethal hit", () => {
    const c = ensureStunPool(makeChar());
    const { char, knockedOut } = applyStunDamage(c, c.stun!.current);
    assertEquals(char.stun!.current, 0);
    assert(knockedOut);
    assert(isUnconscious(char));
  });

  it("does not double-report knockedOut on subsequent hits", () => {
    const c = ensureStunPool(makeChar());
    const ko = applyStunDamage(c, c.stun!.current).char;
    const { knockedOut } = applyStunDamage(ko, 3);
    assertEquals(knockedOut, false);
  });

  it("clamps stun.current at 0", () => {
    const c = ensureStunPool(makeChar());
    const { char } = applyStunDamage(c, c.stun!.max + 100);
    assertEquals(char.stun!.current, 0);
  });

  it("works on legacy chars without stun (lazy init)", () => {
    const c = makeChar();
    const { char } = applyStunDamage(c, 3);
    assertEquals(char.stun!.current, calcMaxStun(c) - 3);
  });
});

describe("recoverStun()", () => {
  it("restores stun to max on rest", () => {
    const c = ensureStunPool(makeChar());
    const damaged = applyStunDamage(c, 10).char;
    const restored = recoverStun(damaged);
    assertEquals(restored.stun!.current, restored.stun!.max);
    assert(!isUnconscious(restored));
  });

  it("revives an unconscious character", () => {
    const c = ensureStunPool(makeChar());
    const ko = applyStunDamage(c, c.stun!.current).char;
    assert(isUnconscious(ko));
    const up = recoverStun(ko);
    assert(!isUnconscious(up));
  });

  it("works on legacy chars without stun", () => {
    const c = makeChar();
    const r = recoverStun(c);
    assertEquals(r.stun!.current, r.stun!.max);
  });
});

describe("isUnconscious()", () => {
  it("false when stun field missing (legacy)", () => {
    assertEquals(isUnconscious(makeChar()), false);
  });
  it("false when stun > 0", () => {
    assertEquals(isUnconscious(ensureStunPool(makeChar())), false);
  });
});

// Demonstrates the rubber-ammo route: when result.nonLethal is true,
// callers should send result.netDamage to applyStunDamage instead of
// applyDamageToChar. This test asserts the helper supports that flow.
describe("rubber ammo routing (integration shape)", () => {
  it("routes non-lethal netDamage to stun pool, leaving HP untouched", () => {
    const c = ensureStunPool(makeChar());
    const hpBefore = c.hp.current;
    const result = { netDamage: 4, nonLethal: true, hit: true };
    const updated = result.hit && result.nonLethal
      ? applyStunDamage(c, result.netDamage).char
      : c;
    assertEquals(updated.hp.current, hpBefore);
    assertEquals(updated.stun!.current, c.stun!.max - 4);
  });
});
