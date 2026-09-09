import { assertEquals, assert } from "jsr:@std/assert";
import { describe, it } from "jsr:@std/testing/bdd";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import type { IWoDChar } from "../core/types.ts";

const baseChar: IWoDChar = {
  id: "c1", playerId: "p1", splat: "wta", status: "approved", chargenStep: 6,
  concept: "Test", attributePriority: ["", "", ""], attributes: {},
  attributeSpecialties: {}, abilityPriority: ["", "", ""], abilities: {},
  abilitySpecialties: {}, backgrounds: {}, willpower: 5,
  freebiesRemaining: 0, freebiesLog: [], xpTotal: 0, xpSpent: 0,
  notes: [], staffNotes: "", statLog: [], createdAt: 0, updatedAt: 0,
  rage: 4,
};

describe("frenzyBlockMessage", () => {
  it("returns null for a composed character", () => {
    assertEquals(frenzyBlockMessage(baseChar, "spend Gnosis"), null);
  });

  it("blocks during berserk frenzy with the action label", () => {
    const c = { ...baseChar, frenzyState: "berserk" as const, frenzyUntil: 0 };
    const msg = frenzyBlockMessage(c, "spend Gnosis");
    assert(msg !== null);
    assert(msg!.includes("berserk frenzy"));
    assert(msg!.includes("spend Gnosis"));
  });

  it("blocks during fox frenzy with distinct label", () => {
    const c = { ...baseChar, frenzyState: "fox" as const, frenzyUntil: 0 };
    const msg = frenzyBlockMessage(c, "cast a rite");
    assert(msg !== null);
    assert(msg!.includes("fox frenzy"));
    assert(msg!.includes("cast a rite"));
  });

  it("unblocks once timed frenzy has expired", () => {
    const c = { ...baseChar, frenzyState: "berserk" as const, frenzyUntil: 1 };
    // frenzyUntil=1ms is long past — isFrenzied returns false.
    assertEquals(frenzyBlockMessage(c, "step sideways"), null);
  });

  it("preserves action label verbatim (no rewriting)", () => {
    const c = { ...baseChar, frenzyState: "berserk" as const, frenzyUntil: 0 };
    const msg = frenzyBlockMessage(c, "do the thing");
    assert(msg!.includes("do the thing"));
  });
});
