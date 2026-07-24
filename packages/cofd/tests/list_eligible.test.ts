// +cg/list eligibility — only options the sheet can take appear.

import {
  assertEquals,
  assertStringIncludes,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { defaultSheet } from "../src/stats/sheet.ts";
import { setTrait } from "../src/stats/setter.ts";
import { renderCgList } from "../src/chargen/list.ts";
import {
  eligibleMerits,
  eligibleGifts,
  eligibleContracts,
  eligibleKiths,
  eligibleListTopics,
  isWerewolf,
  isChangeling,
} from "../src/chargen/list_eligible.ts";
import { COFD_MERITS } from "../src/dictionary/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

describe("+cg/list eligibility", OPTS, () => {
  it("merits omit entries whose prereqs fail", () => {
    // Default sheet: all attrs 1, skills 0 — Hardy needs Stamina >= 3.
    const sheet = defaultSheet();
    const keys = eligibleMerits(sheet).map((m) => m.key);
    assertEquals(keys.includes("hardy"), false);
    assertEquals(keys.includes("indomitable"), false);

    // No-prereq merits still show.
    const open = COFD_MERITS.filter(
      (m) => !m.prereqs || m.prereqs.length === 0,
    );
    assert(open.length > 0, "expected some open merits");
    for (const m of open.slice(0, 5)) {
      assert(
        keys.includes(m.key),
        `open merit ${m.key} should list`,
      );
    }
  });

  it("merits appear once prereqs are met", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "stamina", 3);
    const keys = eligibleMerits(sheet).map((m) => m.key);
    assertEquals(keys.includes("hardy"), true);
    assertEquals(keys.includes("iron stomach"), true);
  });

  it("template-locked merits stay hidden on wrong splat", () => {
    const mortal = defaultSheet();
    const keys = eligibleMerits(mortal).map((m) => m.key);
    assertEquals(keys.includes("biokinesis"), false);

    let psychic = defaultSheet();
    psychic = setTrait(psychic, "template", "psychic");
    const pKeys = eligibleMerits(psychic).map((m) => m.key);
    assertEquals(pKeys.includes("biokinesis"), true);
  });

  it("+cg/list merits only shows takeable names", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "stamina", 3);
    const out = renderCgList("merits physical", sheet);
    assertStringIncludes(out, "Hardy");
    assertStringIncludes(out, "Iron Stomach");
    // Berserker needs Strength >= 3 + Iron Stamina — still hidden.
    assertEquals(out.includes("Berserker"), false);
  });

  it("index hides splat topics for mortals", () => {
    const idx = renderCgList("", defaultSheet());
    assertStringIncludes(idx, "merits");
    assertStringIncludes(idx, "virtues");
    assertEquals(idx.includes("auspices"), false);
    assertEquals(idx.includes("seemings"), false);
    assertEquals(idx.includes("contracts"), false);
    assertEquals(idx.includes("gifts"), false);
  });

  it("werewolf sheet unlocks werewolf topics only", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");
    assert(isWerewolf(sheet));
    const topics = eligibleListTopics(sheet);
    assert(topics.has("auspices"));
    assert(topics.has("gifts"));
    assertEquals(topics.has("seemings"), false);

    const idx = renderCgList("", sheet);
    assertStringIncludes(idx, "auspices");
    assertEquals(idx.includes("seemings"), false);
  });

  it("changeling sheet unlocks changeling topics only", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    assert(isChangeling(sheet));
    const topics = eligibleListTopics(sheet);
    assert(topics.has("seemings"));
    assert(topics.has("contracts"));
    assertEquals(topics.has("auspices"), false);
  });

  it("gifts require werewolf + filter by affinity", () => {
    assertEquals(eligibleGifts(defaultSheet()).length, 0);

    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "werewolf");
    sheet = setTrait(sheet, "auspice", "Rahu");
    sheet = setTrait(sheet, "tribe", "Blood Talons");
    const names = eligibleGifts(sheet).map((g) => g.name);
    // Rahu moon gift + Blood Talon shadow affinities + wolf gifts.
    assert(names.some((n) => /Full Moon/i.test(n) || /Rage/i.test(n)));
    assert(names.some((n) => /Rage/i.test(n)));
  });

  it("contracts require changeling; court/royal gated", () => {
    assertEquals(eligibleContracts(defaultSheet()).length, 0);

    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    // No court yet — court contracts hidden; goblin + common ok.
    const noCourt = eligibleContracts(sheet);
    assert(noCourt.some((c) => c.type === "goblin"));
    assertEquals(
      noCourt.some((c) => c.type === "court"),
      false,
    );

    sheet = setTrait(sheet, "court", "Spring");
    const withCourt = eligibleContracts(sheet);
    assert(
      withCourt.some(
        (c) =>
          c.type === "court" &&
          (c.court ?? "").toLowerCase() === "spring",
      ),
    );
    assertEquals(
      withCourt.some(
        (c) =>
          c.type === "court" &&
          (c.court ?? "").toLowerCase() === "winter",
      ),
      false,
    );
  });

  it("wrong-template topic shows lock message", () => {
    const out = renderCgList("contracts", defaultSheet());
    assertStringIncludes(out, "only listed for Changeling");
  });

  it("kiths narrow to the sheet's seeming when set", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "changeling");
    const all = eligibleKiths(sheet);
    assert(all.length > 10, "all kiths before seeming");

    sheet = setTrait(sheet, "seeming", "Beast");
    const beast = eligibleKiths(sheet);
    assert(beast.length > 0);
    assert(beast.length < all.length);
    assert(
      beast.every((k) => k.seeming.toLowerCase() === "beast"),
    );

    const out = renderCgList("kiths", sheet);
    assertStringIncludes(out, "Beast");
    // Fairest-only kiths should not appear under Beast.
    assertEquals(out.includes("Fairest"), false);
  });
});
