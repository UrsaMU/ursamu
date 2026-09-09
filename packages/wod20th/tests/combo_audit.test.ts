// tests/combo_audit.test.ts -- /tdd-audit security pass for +combo (combo
// gifts) and +gift/use totem-boon path. Mirrors gift_audit conventions:
// source-text guards + pure mechanic-level checks.
import { assert, assertFalse } from "@std/assert";
import { describe, it } from "jsr:@std/testing@^1.0.0/bdd";

import {
  activateCombo,
  canLearnCombo,
  comboXpCost,
  forgetCombo,
  learnCombo,
} from "../core/comboGifts.ts";
import type { IComboGiftDef } from "../core/types.ts";
import { frenzyBlockMessage } from "../core/frenzyGate.ts";
import type { IWoDChar } from "../core/types.ts";

const COMBO_SRC = await Deno.readTextFile(
  new URL("../commands/combo.ts", import.meta.url),
);
const GIFT_SRC = await Deno.readTextFile(
  new URL("../commands/gift.ts", import.meta.url),
);
const BOON_SRC = await Deno.readTextFile(
  new URL("../commands/giftBoon.ts", import.meta.url),
);

function mkChar(over: Partial<IWoDChar> = {}): IWoDChar {
  return {
    id: "c", playerId: "p", splat: "wta", status: "approved", chargenStep: 6,
    concept: "",
    attributePriority: ["", "", ""] as [string, string, string],
    attributes: {
      Strength: 3, Dexterity: 3, Stamina: 3,
      Charisma: 3, Manipulation: 3, Appearance: 3,
      Perception: 3, Intelligence: 3, Wits: 3,
    },
    attributeSpecialties: {},
    abilityPriority: ["", "", ""] as [string, string, string],
    abilities: { Empathy: 3, Subterfuge: 3 },
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 6, willpowerCurrent: 6,
    rage: 5, rageCurrent: 5,
    gnosis: 6, gnosisCurrent: 6,
    freebiesRemaining: 0, freebiesLog: [],
    xpTotal: 100, xpSpent: 0, notes: [], staffNotes: "",
    statLog: [], createdAt: 0, updatedAt: 0,
    breed: "homid",
    auspice: "philodox",
    tribe: "bone-gnawers",
    gifts: ["Cooking", "Persuasion"],
    ...over,
  };
}

describe("/tdd-audit +combo", () => {
  // C-1: cannot learn a combo whose prereqs you don't fully know.
  it("C-1: learnCombo blocks when prereqs are missing", () => {
    const char = mkChar({ gifts: ["Cooking"] });
    const res = learnCombo(char, "cooking-the-books");
    assertFalse(res.ok);
    assert(/prereq/i.test(res.message));
  });

  // C-2: cannot use a combo you haven't learned.
  it("C-2: activateCombo refuses unlearned combos", () => {
    const r = activateCombo(mkChar(), "cooking-the-books");
    assertFalse(r.ok);
    assert(/have not learned/i.test(r.message));
  });

  // C-3: frenzy gate runs before activation in commands/combo.ts.
  it("C-3: command consults frenzyBlockMessage before activateCombo", () => {
    assert(
      /frenzyBlockMessage\(char, "activate a combo gift"\)/.test(COMBO_SRC),
      "command must consult frenzyBlockMessage with the right label",
    );
    const frenIdx = COMBO_SRC.indexOf("frenzyBlockMessage(char");
    const actIdx  = COMBO_SRC.indexOf("activateCombo(char");
    assert(frenIdx > 0 && actIdx > frenIdx,
      "frenzy gate must run before activateCombo()");
    // Mechanic-level: frenzy returns block message.
    const berserk = mkChar({ frenzyState: "berserk" });
    assert(frenzyBlockMessage(berserk, "activate a combo gift")?.includes("berserk"));
    const fox = mkChar({ frenzyState: "fox" });
    assert(frenzyBlockMessage(fox, "activate a combo gift")?.includes("fox"));
  });

  // C-4: cost fail-closed across pools (no partial spends).
  it("C-4: cost fail-closed -- insufficient Gnosis short-circuits", () => {
    const char = mkChar({
      comboGifts: ["cooking-the-books"],
      gnosis: 0, gnosisCurrent: 0,
    });
    const r = activateCombo(char, "cooking-the-books");
    assertFalse(r.ok);
    assert(/insufficient gnosis/i.test(r.message));
  });

  // C-5: restriction enforcement.
  it("C-5: tribe-locked combo refused for wrong tribe", () => {
    const char = mkChar({ tribe: "silver-fangs" });
    const res = canLearnCombo(char, "cooking-the-books");
    assertFalse(res.ok);
    assert(/restricted/i.test(res.reason));
  });

  // C-6: forgotten combo cannot be used.
  it("C-6: forget round-trips -- cannot use after forget", () => {
    const char = mkChar();
    learnCombo(char, "cooking-the-books");
    assert(activateCombo(char, "cooking-the-books").ok);
    const f = forgetCombo(char, "cooking-the-books");
    assert(f.ok);
    const r = activateCombo(char, "cooking-the-books");
    assertFalse(r.ok);
  });

  // C-7: WtA gate present.
  it("C-7: command refuses non-WtA characters", () => {
    assert(
      /char\.splat\s*!==\s*"wta"/.test(COMBO_SRC),
      "command must gate splat !== 'wta'",
    );
    assert(
      /Only Garou \(WtA\) characters can use combo gifts\./.test(COMBO_SRC),
    );
  });

  // C-8: hook fires AFTER saveChar.
  it("C-8: wod20th:gift-used hook fires AFTER saveChar in /use path", () => {
    const useIdx = COMBO_SRC.indexOf('if (sw === "use")');
    assert(useIdx > 0);
    const saveIdx = COMBO_SRC.indexOf("await saveChar(char)", useIdx);
    const hookIdx = COMBO_SRC.indexOf(
      'gameHooks.emit("wod20th:gift-used"',
      useIdx,
    );
    assert(saveIdx > 0 && hookIdx > saveIdx,
      "hook emission must follow saveChar in /use");
  });

  // C-9: poseRoom does not fire on failure paths in /use.
  it("C-9: failure branches return before poseRoom in /use", () => {
    const useIdx = COMBO_SRC.indexOf('if (sw === "use")');
    const slice = COMBO_SRC.slice(useIdx);
    const poseIdx = slice.indexOf("poseRoom(");
    assert(poseIdx > 0, "must locate poseRoom");
    const failActIdx = slice.indexOf("if (!result.ok)");
    assert(failActIdx > 0 && failActIdx < poseIdx,
      "activateCombo failure must return before poseRoom");
    assert(
      /if \(!result\.ok\)\s*\{\s*u\.send\(result\.message\);\s*return;\s*\}/.test(slice),
      "activateCombo failure must return early",
    );
    assert(
      /if \(!spend\.ok\)\s*\{\s*u\.send\(spend\.message\);\s*return;\s*\}/.test(slice),
      "spendPool failure must return early",
    );
  });
});

describe("/tdd-audit +gift/use totem-boon path", () => {
  // B-1: gift.ts delegates boon attempts to tryUseTotemBoon BEFORE the
  // regular gift activation.
  it("B-1: gift.ts intercepts boon attempts before activateGift", () => {
    const tryIdx = GIFT_SRC.indexOf("tryUseTotemBoon(");
    const actIdx = GIFT_SRC.indexOf("activateGift(char");
    assert(tryIdx > 0 && actIdx > tryIdx,
      "tryUseTotemBoon must be called before activateGift");
  });

  // B-2: boon helper spends 1 Gnosis flat (via applyTotemBoonSpend, whose
  // implementation lives in core/totemBoon.ts).
  it("B-2: boon helper spends 1 Gnosis", () => {
    const TOTEM_BOON_SRC = Deno.readTextFileSync(
      new URL("../core/totemBoon.ts", import.meta.url),
    );
    assert(/spendPool\(char, "gnosis", 1\)/.test(TOTEM_BOON_SRC),
      "applyTotemBoonSpend must spend 1 Gnosis");
    assert(/applyTotemBoonSpend\(char\)/.test(BOON_SRC),
      "boon helper must invoke applyTotemBoonSpend");
  });

  // B-2b (M-2): boon spend path does NOT triple-call spendPool. The pure
  // spendPool helper does not mutate state, but the old code called it
  // three times (pre-check + pre + commit) which is brittle: if spendPool
  // ever gains a side effect, the char gets over-charged. Combined boon
  // spend path (giftBoon.ts + core/totemBoon.ts) must contain at most ONE
  // spendPool call per use.
  it("B-2b: combined boon spend path has exactly one spendPool call", () => {
    const TOTEM_BOON_SRC = Deno.readTextFileSync(
      new URL("../core/totemBoon.ts", import.meta.url),
    );
    const both = BOON_SRC + "\n---\n" + TOTEM_BOON_SRC;
    const matches = both.match(/spendPool\(/g) ?? [];
    assert(
      matches.length === 1,
      `expected exactly one spendPool() call across giftBoon.ts + totemBoon.ts, got ${matches.length}`,
    );
  });

  // B-3: boon helper frenzy-gated.
  it("B-3: boon helper consults frenzyBlockMessage", () => {
    assert(
      /frenzyBlockMessage\(char, "invoke a totem boon"\)/.test(BOON_SRC),
      "boon helper must run the frenzy gate",
    );
  });

  // B-4: boon helper saves before hook.
  it("B-4: saveChar precedes hook emission in boon helper", () => {
    const saveIdx = BOON_SRC.indexOf("await saveChar(char)");
    const hookIdx = BOON_SRC.indexOf('gameHooks.emit("wod20th:gift-used"');
    assert(saveIdx > 0 && hookIdx > saveIdx,
      "boon helper: hook must emit AFTER saveChar");
  });

  // C-10 (H-1): +combo/learn gates on char.status === "approved" so that
  // drafts / submitted / denied characters cannot spend XP via combos.
  // Mirrors core/xp.ts spendXp() which enforces the same invariant.
  it("C-10: /learn enforces char.status === 'approved' before XP spend", () => {
    // Source-text guard: /learn block must check status before comboXpCost.
    const learnIdx = COMBO_SRC.indexOf('if (sw === "learn")');
    assert(learnIdx > 0, "expected /learn switch in commands/combo.ts");
    // Find the end of the /learn block (next "if (sw ===" after).
    const tail = COMBO_SRC.slice(learnIdx + 20);
    const nextSwIdx = tail.indexOf('if (sw === "');
    const learnBlock = nextSwIdx > 0 ? tail.slice(0, nextSwIdx) : tail;
    assert(
      /char\.status\s*!==\s*"approved"/.test(learnBlock),
      "/learn must reject non-approved chars before XP spend",
    );
    // Status check must precede the XP spend.
    const statusIdx = learnBlock.search(/char\.status\s*!==\s*"approved"/);
    const spendIdx  = learnBlock.indexOf("xpSpent");
    assert(statusIdx > 0 && spendIdx > statusIdx,
      "status check must precede char.xpSpent mutation");
  });

  // C-12 (L-2): comboXpCost must reject combos with invalid level (non-positive
  // integer or > 5). Without this guard, a future data-file entry with level=0
  // would return cost=0 (free learn) and level=-1 would give negative XP debt.
  it("C-12: comboXpCost clamps invalid levels to a safe positive cost", () => {
    const mk = (level: number): IComboGiftDef => ({
      slug: "x", name: "X", level: level as IComboGiftDef["level"],
      prereqs: [], restrictions: [],
      action: { description: "" },
    });
    // Zero and negative must be rejected (throw) or return >= 4 XP.
    const zero = mk(0);
    const neg = mk(-3);
    const huge = mk(99);
    // Either throws or returns a positive integer >= 4 (level 1 cost).
    const safe = (def: IComboGiftDef) => {
      let threw = false;
      let cost = -1;
      try { cost = comboXpCost(def); } catch (_e) { threw = true; }
      assert(
        threw || (Number.isInteger(cost) && cost >= 4),
        `comboXpCost(level=${def.level}) must throw or return >= 4; got ${cost}`,
      );
    };
    safe(zero);
    safe(neg);
    safe(huge);
    // Valid levels return level*4 unchanged.
    assert(comboXpCost(mk(1)) === 4);
    assert(comboXpCost(mk(5)) === 20);
  });

  // C-11 (H-2): +combo/learn writes an audit-trail entry to the wod20th.xp
  // collection (parallel with core/xp.ts spendXp). Without this, staff cannot
  // trace why a character's xpSpent grew.
  it("C-11: /learn persists an IXpEntry via createXpEntry", () => {
    const learnIdx = COMBO_SRC.indexOf('if (sw === "learn")');
    const tail = COMBO_SRC.slice(learnIdx + 20);
    const nextSwIdx = tail.indexOf('if (sw === "');
    const learnBlock = nextSwIdx > 0 ? tail.slice(0, nextSwIdx) : tail;
    assert(
      /createXpEntry\(/.test(learnBlock),
      "/learn must call createXpEntry() so the XP audit log captures the spend",
    );
    // Ledger write should land after the in-char spend (xpSpent mutation).
    const spendIdx = learnBlock.indexOf("xpSpent +=");
    const ledgerIdx = learnBlock.indexOf("createXpEntry(");
    assert(spendIdx > 0 && ledgerIdx > spendIdx,
      "createXpEntry must follow the xpSpent mutation");
  });
});
