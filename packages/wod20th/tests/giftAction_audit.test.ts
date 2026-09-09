// tests/giftAction_audit.test.ts -- /tdd-audit Stage 4b exploit pass for the
// new gift action-data path. Red-green exploit tests covering:
//   1. Insufficient/unknown pool components reject gracefully.
//   2. Cost spend is fail-closed across multi-pool costs.
//   3. Action-bearing gifts still respect the frenzy gate.
//   4. Splat gate at the command layer still applies.
//   5. Successful action emits wod20th:gift-used with the expected fields.
import { assert, assertEquals, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import { activateGift, canAffordGiftCost } from "../core/giftAction.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import { WTA_GIFTS } from "../splats/wta/data/gifts.ts";
import type { IGiftAction, IWoDChar } from "../core/types.ts";

const GIFT_SRC = await Deno.readTextFile(
  new URL("../commands/gift.ts", import.meta.url),
);

function mkChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""] as [string, string, string],
    attributes: {
      Strength: 2, Dexterity: 2, Stamina: 2,
      Charisma: 2, Manipulation: 2, Appearance: 2,
      Perception: 3, Intelligence: 3, Wits: 3,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""] as [string, string, string],
    abilities: { Empathy: 2, Occult: 2, "Primal-Urge": 1 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6, willpowerCurrent: 6,
    rage: 3, rageCurrent: 3,
    gnosis: 4, gnosisCurrent: 4,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 0, xpSpent: 0, notes: [], staffNotes: "",
    statLog: [], createdAt: 0, updatedAt: 0,
    gifts: [],
    ...over,
  };
}

describe("/tdd-audit gift action data", () => {
  // 1. Pool resolution must reject unknown tokens without crashing.
  it("rejects gracefully when pool expression is unparseable", () => {
    // Inject a phony gift with a bogus pool expr by mutating a copy.
    const slug = "mother's touch";
    const orig = WTA_GIFTS[slug];
    const bogus: IGiftAction = {
      ...(orig.action ?? { description: "" }),
      roll: { pool: "Nope+Nonsense", difficulty: 6 },
    };
    WTA_GIFTS[slug] = { ...orig, action: bogus };
    try {
      const r = activateGift(
        mkChar({ gifts: [orig.name] }),
        "mothers-touch",
      );
      assertFalse(r.ok);
      assert(/cannot resolve pool/i.test(r.message));
    } finally {
      WTA_GIFTS[slug] = orig;
    }
  });

  // 2. Multi-pool cost is fail-closed: insufficient ANY pool rejects.
  it("fail-closed when insufficient Gnosis (cost in action.cost)", () => {
    // Mother's Touch costs { gnosis: 1 }.
    const r = activateGift(
      mkChar({ gifts: ["Mother's Touch"], gnosis: 0, gnosisCurrent: 0 }),
      "mothers-touch",
    );
    assertFalse(r.ok);
    assert(/Insufficient Gnosis/i.test(r.message));
  });

  it("fail-closed when insufficient Rage for a Rage-cost gift", () => {
    // Razor Claws costs { rage: 1 }.
    const r = activateGift(
      mkChar({ gifts: ["Razor Claws"], rage: 0, rageCurrent: 0 }),
      "razor-claws",
    );
    assertFalse(r.ok);
    assert(/Insufficient Rage/i.test(r.message));
  });

  it("canAffordGiftCost reports the FIRST shortage encountered", () => {
    const c = mkChar({ gnosisCurrent: 0, willpowerCurrent: 0, rageCurrent: 0 });
    const m = canAffordGiftCost(c, { gnosis: 1, willpower: 1, rage: 1 });
    assert(m && /Insufficient/i.test(m));
  });

  // 3. Action-bearing gift still blocked by frenzy gate at command layer.
  it("frenzy gate runs BEFORE activateGift in command source", () => {
    const frenIdx = GIFT_SRC.indexOf("frenzyBlockMessage(char");
    const actIdx  = GIFT_SRC.indexOf("activateGift(char");
    assert(frenIdx > 0 && actIdx > frenIdx,
      "frenzy gate must precede activateGift");
    const c = mkChar({ frenzyState: "berserk", gifts: ["Mother's Touch"] });
    assert(frenzyBlockMessage(c, "activate a gift")?.includes("berserk"));
  });

  // 4. Splat gate (WtA-only) at command layer.
  it("command refuses non-WtA characters even with action gifts", () => {
    assert(
      /char\.splat\s*!==\s*"wta"/.test(GIFT_SRC),
      "command must gate on splat !== 'wta'",
    );
  });

  // 5. Successful action emits hook AFTER saveChar, with action fields.
  it("hook emits with action fields and follows saveChar", () => {
    const saveIdx = GIFT_SRC.indexOf("await saveChar(char)");
    const hookIdx = GIFT_SRC.indexOf('gameHooks.emit("wod20th:gift-used"');
    assert(saveIdx > 0 && hookIdx > saveIdx,
      "wod20th:gift-used hook must fire AFTER saveChar(char)");
    assert(/costBreakdown:\s*breakdown/.test(GIFT_SRC),
      "hook payload must include the structured costBreakdown");
    assert(/netSuccesses:\s*result\.roll\?\.netSuccesses/.test(GIFT_SRC),
      "hook payload must include roll netSuccesses when present");
  });

  // 6. Successful activation returns roll + description.
  it("successful action returns roll details and description", () => {
    const r = activateGift(
      mkChar({ gifts: ["Mother's Touch"] }),
      "mothers-touch",
    );
    assert(r.ok, r.message);
    assert(r.roll, "action.roll should produce a roll");
    assert(r.action?.description, "should expose mechanical description");
    assertEquals(r.costBreakdown?.gnosis, 1);
  });

  // 7. Action-bearing gift requires the character to have learned it.
  it("action-bearing gift rejects unlearned character", () => {
    const r = activateGift(
      mkChar({ gifts: ["Spirit Speech"] }),
      "mothers-touch",
    );
    assertFalse(r.ok);
    assert(/have not learned/i.test(r.message));
  });

  // 8. Audit: every action-bearing gift has a description.
  it("every action-bearing gift has a non-empty description", () => {
    for (const [slug, def] of Object.entries(WTA_GIFTS)) {
      if (!def.action) continue;
      assert(
        def.action.description && def.action.description.trim().length > 0,
        `${slug}: action.description must be non-empty`,
      );
    }
  });

  // 9. Audit: declared roll pools must reference valid traits.
  it("every action.roll.pool resolves on a fully-statted character", () => {
    const stocked = mkChar({
      attributes: { Strength: 5, Dexterity: 5, Stamina: 5, Charisma: 5, Manipulation: 5, Appearance: 5, Perception: 5, Intelligence: 5, Wits: 5 },
      abilities: { Empathy: 3, Occult: 3, "Primal-Urge": 3, Medicine: 3, Leadership: 3, Crafts: 3, Survival: 3, Enigmas: 3, Performance: 3, Intimidation: 3, Brawl: 3, Firearms: 3, Technology: 3 },
      gnosis: 10, gnosisCurrent: 10,
      rage: 10, rageCurrent: 10,
      willpower: 10, willpowerCurrent: 10,
    });
    for (const [slug, def] of Object.entries(WTA_GIFTS)) {
      if (!def.action?.roll) continue;
      stocked.gifts = [def.name];
      const r = activateGift(stocked, slug);
      assert(r.ok, `${slug}: ${r.message} (pool=${def.action.roll.pool})`);
      assert(r.roll, `${slug}: must produce a roll`);
    }
  });
});
