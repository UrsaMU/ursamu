// tests/gift_audit.test.ts -- /tdd-audit security pass for +gift/use and
// core/giftAction.ts. Pure activation logic is exercised directly; the
// command-level frenzy gate, splat gate, cost spend ordering, and
// hook-after-persist ordering are regression guards on commands/gift.ts.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { activateGift, lookupGift } from "../core/giftAction.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import type { IWoDChar } from "../core/types.ts";

const GIFT_SRC = await Deno.readTextFile(
  new URL("../commands/gift.ts", import.meta.url),
);

function mkChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""] as [string, string, string],
    attributes: {}, attributeSpecialties: {},
    abilityPriority: ["", "", ""] as [string, string, string],
    abilities: {}, abilitySpecialties: {},
    backgrounds: {},
    willpower: 6, rage: 2, gnosis: 5, gnosisCurrent: 5,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [], staffNotes: "",
    statLog: [], createdAt: 0, updatedAt: 0,
    gifts: ["Mother's Touch"],
    ...over,
  };
}

describe("/tdd-audit +gift/use", () => {
  // G-1: WtA-only.
  it("G-1: command refuses non-WtA characters (regression guard)", () => {
    assert(
      /char\.splat\s*!==\s*"wta"/.test(GIFT_SRC),
      "command must gate splat !== 'wta'",
    );
    assert(
      /Only Garou \(WtA\) characters can use gifts\./.test(GIFT_SRC),
      "command must surface the WtA-only message",
    );
  });

  // G-2: frenzy gate.
  it("G-2: command consults frenzyBlockMessage before activateGift", () => {
    assert(
      /frenzyBlockMessage\(char, "activate a gift"\)/.test(GIFT_SRC),
      "command must consult frenzyBlockMessage with the right label",
    );
    // Order: frenzyBlockMessage call must precede activateGift().
    const frenIdx = GIFT_SRC.indexOf("frenzyBlockMessage(char");
    const actIdx  = GIFT_SRC.indexOf("activateGift(char");
    assert(frenIdx > 0 && actIdx > frenIdx,
      "frenzy gate must run before activateGift()");
    // Mechanic-level: returns a string for berserk and fox states, null otherwise.
    const berserk = mkChar({ frenzyState: "berserk" });
    assert(frenzyBlockMessage(berserk, "activate a gift")?.includes("berserk"));
    const fox = mkChar({ frenzyState: "fox" });
    assert(frenzyBlockMessage(fox, "activate a gift")?.includes("fox"));
    assertEquals(frenzyBlockMessage(mkChar(), "activate a gift"), null);
  });

  // G-3: activateGift rejects unknown slug.
  it("G-3: activateGift rejects unknown slugs", () => {
    const r = activateGift(mkChar(), "totally-fake-gift");
    assertFalse(r.ok);
    assert(/unknown gift/i.test(r.message));
    assertEquals(lookupGift("totally-fake-gift"), undefined);
  });

  // G-4: activateGift rejects gifts not in char.gifts.
  it("G-4: activateGift rejects unlearned gifts", () => {
    const char = mkChar({ gifts: ["Spirit Speech"] });
    const r = activateGift(char, "mothers-touch");
    assertFalse(r.ok);
    assert(r.message.includes("Mother's Touch"));
  });

  // G-5: cost spend happens after activation; legacy gifts default to
  // Gnosis = level; action-bearing gifts use action.cost.
  it("G-5: spendPool runs after activateGift returns ok (regression guard)", () => {
    const okIdx    = GIFT_SRC.indexOf("if (!result.ok)");
    const spendIdx = GIFT_SRC.indexOf("spendPool(char");
    assert(okIdx > 0 && spendIdx > okIdx,
      "spendPool must come after the activation ok-check");
    assert(
      /result\.costBreakdown/.test(GIFT_SRC),
      "command must read costBreakdown from activation result",
    );
    // Mechanic-level: legacy (no action) -> cost == level; action gifts ->
    // cost reflects action.cost.gnosis (may be 0 when no Gnosis is required).
    for (const [slug, def] of Object.entries(WTA_GIFTS)) {
      // Provide enough of every pool to cover any action cost.
      const r = activateGift(
        mkChar({
          gifts: [def.name],
          gnosis: 10, gnosisCurrent: 10,
          rage: 10, rageCurrent: 10,
          willpower: 10, willpowerCurrent: 10,
          attributes: { Strength: 5, Dexterity: 5, Stamina: 5, Charisma: 5, Manipulation: 5, Appearance: 5, Perception: 5, Intelligence: 5, Wits: 5 },
          abilities: { Empathy: 3, Occult: 3, "Primal-Urge": 3, Medicine: 3, Leadership: 3, Crafts: 3, Survival: 3, Enigmas: 3, Performance: 3, Intimidation: 3, Brawl: 3, Firearms: 3, Technology: 3 },
        }),
        slug,
      );
      assert(r.ok, `${slug}: ${r.message}`);
      if (def.action) {
        // Action-bearing: r.cost reflects the Gnosis portion of the
        // structured cost. When action.cost is absent, the default is
        // { gnosis: level }; when present, use its gnosis (0 if missing).
        const expected = def.action.cost
          ? (def.action.cost.gnosis ?? 0)
          : def.level;
        assertEquals(r.cost, expected, `${slug}: cost mismatch`);
      } else {
        assertEquals(r.cost, def.level);
      }
    }
  });

  // G-6: slug normalization (case + whitespace).
  it("G-6: lookupGift normalizes case and whitespace", () => {
    const a = lookupGift("  MOTHERS-TOUCH  ");
    assert(a, "must resolve a noisy slug");
    assertEquals(a!.key, "mother's touch");
    assertEquals(a!.def.name, "Mother's Touch");
    // Identity preserved on canonical slug.
    const b = lookupGift("mother's touch");
    assertEquals(b!.key, "mother's touch");
  });

  // G-7: hook fires AFTER saveChar (downstream sees persisted state).
  it("G-7: hook emission follows saveChar (ordering)", () => {
    const saveIdx = GIFT_SRC.indexOf("await saveChar(char)");
    const hookIdx = GIFT_SRC.indexOf('gameHooks.emit("wod20th:gift-used"');
    assert(saveIdx > 0, "saveChar must be present");
    assert(hookIdx > saveIdx,
      "wod20th:gift-used hook must fire AFTER saveChar(char)");
  });

  // G-8: no broadcast on failure paths.
  it("G-8: poseRoom does not fire when activateGift/spendPool fail", () => {
    // Source: every failure branch returns BEFORE poseRoom. There is
    // exactly one poseRoom call in this command (the /use success
    // narration); both failure-return guards must precede it textually.
    const block = GIFT_SRC;
    const poseIdx = block.indexOf("poseRoom(");
    const failActIdx = block.indexOf("if (!result.ok)");
    const failSpdIdx = block.indexOf("if (!spend.ok)");
    assert(poseIdx > 0, "must locate the poseRoom narration call");
    assert(failActIdx > 0 && failActIdx < poseIdx,
      "activateGift failure must return before poseRoom");
    assert(failSpdIdx > 0 && failSpdIdx < poseIdx,
      "spendPool failure must return before poseRoom");
    // And each guarded branch must `return;` -- otherwise control falls through.
    assert(
      /if \(!result\.ok\)\s*\{\s*u\.send\(result\.message\);\s*return;\s*\}/.test(block),
      "activateGift failure must return early",
    );
    assert(
      /if \(!spend\.ok\)\s*\{\s*u\.send\(spend\.message\);\s*return;\s*\}/.test(block),
      "spendPool failure must return early",
    );
  });

  // Mechanic: empty slug rejected.
  it("activateGift rejects empty / whitespace slugs", () => {
    const r1 = activateGift(mkChar(), "");
    const r2 = activateGift(mkChar(), "   ");
    assertFalse(r1.ok);
    assertFalse(r2.ok);
  });
});
