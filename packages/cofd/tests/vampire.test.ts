// Vampire: The Requiem 2e chargen overlay tests.

import {
  assertEquals,
  assertStringIncludes,
  assert,
} from "@std/assert";
import { describe, it } from "@std/testing/bdd";
import { defaultSheet, setTrait } from "../cofd.ts";
import {
  initCgState,
  updateCgState,
  maxStageFor,
  startingMeritDots,
  startingPowerDots,
  type CofdCgState,
} from "../src/chargen/state.ts";
import { validateCurrentStage } from "../src/chargen/validate.ts";
import { renderCgList } from "../src/chargen/list.ts";
import {
  eligibleClans,
  eligibleCovenants,
  eligibleDisciplines,
  eligibleListTopics,
  isVampire,
} from "../src/chargen/list_eligible.ts";
import {
  findClan,
  findCovenant,
  findDiscipline,
  findMaskDirge,
  isInClanDiscipline,
  VTR_CLAN_NAMES,
  VTR_DISCIPLINE_NAMES,
} from "../src/dictionary/vampire.ts";
import { COFD_TEMPLATES } from "../src/gamelines/templates.ts";
import { isChargenTemplate } from "../src/gamelines/templates.ts";
import { headerSection } from "../src/sheet/sections/header.ts";
import type { SheetContext } from "../src/sheet/sections/types.ts";
import { renderInfo } from "../src/info/index.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function vampState(
  opts: {
    clan?: string;
    covenant?: string;
    touchstone?: string;
    mask?: string;
    dirge?: string;
  } = {},
): CofdCgState {
  const s = initCgState();
  s.sheet.template = "vampire";
  s.sheet.concept = "Neonate socialite";
  s.sheet.virtue = opts.mask ?? "Authoritarian";
  s.sheet.vice = opts.dirge ?? "Survivor";
  s.sheet.customFields.clan = opts.clan ?? "Daeva";
  s.sheet.customFields.covenant = opts.covenant ?? "Invictus";
  s.sheet.customFields.touchstone =
    opts.touchstone ?? "My sister Elena";
  s.sheet.powerStatValue = 1;
  s.sheet.moralityValue = 7;
  return s;
}

describe("Vampire: The Requiem catalog", OPTS, () => {
  it("exports five clans and ten common Disciplines", () => {
    assertEquals(VTR_CLAN_NAMES.length, 5);
    assertEquals(VTR_DISCIPLINE_NAMES.length, 10);
    assert(findClan("daeva"));
    assert(findCovenant("Unaligned"));
    assert(findDiscipline("Majesty"));
    assert(findMaskDirge("Authoritarian"));
  });

  it("isInClanDiscipline matches clan lists", () => {
    assert(isInClanDiscipline("Daeva", "celerity"));
    assert(isInClanDiscipline("Daeva", "Majesty"));
    assert(isInClanDiscipline("Daeva", "vigor"));
    assertEquals(
      isInClanDiscipline("Daeva", "dominate"),
      false,
    );
  });

  it("template is registered for chargen", () => {
    assert(isChargenTemplate("vampire"));
    assert(COFD_TEMPLATES.vampire);
    assertEquals(
      COFD_TEMPLATES.vampire.moralityName,
      "Humanity",
    );
    assertEquals(
      COFD_TEMPLATES.vampire.powerStatName,
      "Blood Potency",
    );
    assertEquals(maxStageFor("vampire"), 7);
    assertEquals(startingMeritDots("vampire"), 10);
    assertEquals(startingPowerDots("vampire"), 3);
  });
});

describe("Vampire sheet defaults", OPTS, () => {
  it("sets Blood Potency 1 and Vitae on template", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    assertEquals(sheet.template, "vampire");
    assertEquals(sheet.powerStatValue, 1);
    assertEquals(sheet.energyCurrent, 10);
  });

  it("sets clan, covenant, touchstone custom fields", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    sheet = setTrait(sheet, "clan", "Mekhet");
    sheet = setTrait(sheet, "covenant", "Ordo Dracul");
    sheet = setTrait(sheet, "touchstone", "Father Marcus");
    assertEquals(sheet.customFields.clan, "Mekhet");
    assertEquals(
      sheet.customFields.covenant,
      "Ordo Dracul",
    );
    assertEquals(
      sheet.customFields.touchstone,
      "Father Marcus",
    );
  });

  it("mask/dirge aliases write virtue/vice", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    sheet = setTrait(sheet, "mask", "Scholar");
    sheet = setTrait(sheet, "dirge", "Monster");
    assertEquals(sheet.virtue, "Scholar");
    assertEquals(sheet.vice, "Monster");
  });

  it("header labels Mask/Dirge for vampires", async () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    sheet = setTrait(sheet, "mask", "Rebel");
    sheet = setTrait(sheet, "dirge", "Nomad");
    sheet = setTrait(sheet, "clan", "Gangrel");
    const ctx: SheetContext = {
      playerName: "Test",
      sheet,
      template: COFD_TEMPLATES.vampire,
      width: 78,
    };
    const lines = await headerSection.render(ctx);
    const text = lines.join("\n");
    assertStringIncludes(text.toLowerCase(), "mask");
    assertStringIncludes(text.toLowerCase(), "dirge");
    assertStringIncludes(text, "Rebel");
    assertStringIncludes(text, "Nomad");
    assertStringIncludes(text, "Gangrel");
  });
});

describe("Vampire chargen validation", OPTS, () => {
  it("stage 3 requires clan, covenant, touchstone", () => {
    const s = vampState();
    s.stage = 3;
    delete s.sheet.customFields.touchstone;
    const r = validateCurrentStage(s);
    assertEquals(r.valid, false);
    assertStringIncludes(r.error ?? "", "touchstone");
  });

  it("stage 3 allows empty bloodline", () => {
    const s = vampState();
    s.stage = 3;
    const r = validateCurrentStage(s);
    assertEquals(r.valid, true, r.error);
  });

  it("stage 3 rejects mortal Virtue after vampire template", () => {
    const s = vampState({ mask: "Just" });
    s.stage = 3;
    // Just is a CoFD virtue, not a Mask archetype.
    s.sheet.virtue = "Just";
    const r = validateCurrentStage(s);
    assertEquals(r.valid, false);
    assertStringIncludes(r.error ?? "", "Mask");
  });

  it("stage 7 requires exactly 3 Discipline dots", () => {
    const s = vampState();
    s.stage = 7;
    s.sheet.powers = { celerity: 1, majesty: 1 };
    const r = validateCurrentStage(s);
    assertEquals(r.valid, false);
    assertStringIncludes(r.error ?? "", "3");
  });

  it("stage 7 requires ≥2 in-clan dots", () => {
    const s = vampState({ clan: "Daeva" });
    s.stage = 7;
    // Dominate is Ventrue — out of clan for Daeva.
    s.sheet.powers = {
      dominate: 2,
      obfuscate: 1,
    };
    const r = validateCurrentStage(s);
    assertEquals(r.valid, false);
    assertStringIncludes(r.error ?? "", "in-clan");
  });

  it("stage 7 accepts 2 in-clan + 1 out", () => {
    const s = vampState({ clan: "Daeva" });
    s.stage = 7;
    s.sheet.powers = {
      celerity: 1,
      majesty: 1,
      dominate: 1,
    };
    const r = validateCurrentStage(s);
    assertEquals(r.valid, true, r.error);
  });

  it("stage 7 accepts 3 in-clan", () => {
    const s = vampState({ clan: "Ventrue" });
    s.stage = 7;
    s.sheet.powers = {
      dominate: 2,
      resilience: 1,
    };
    const r = validateCurrentStage(s);
    assertEquals(r.valid, true, r.error);
  });

  it("updateCgState sets disciplines in stage 7", () => {
    let s = vampState();
    s.stage = 7;
    s = updateCgState(s, "celerity", "2");
    s = updateCgState(s, "majesty", "1");
    assertEquals(s.sheet.powers.celerity, 2);
    assertEquals(s.sheet.powers.majesty, 1);
  });

  it("stage 3 accepts mask/dirge aliases", () => {
    let s = vampState({ mask: "Unknown", dirge: "Unknown" });
    s.sheet.virtue = "Unknown";
    s.sheet.vice = "Unknown";
    s.stage = 3;
    s = updateCgState(s, "mask", "Guru");
    s = updateCgState(s, "dirge", "Penitent");
    assertEquals(s.sheet.virtue, "Guru");
    assertEquals(s.sheet.vice, "Penitent");
    const r = validateCurrentStage(s);
    assertEquals(r.valid, true, r.error);
  });

  it("stage 6 requires 10 merit dots", () => {
    const s = vampState();
    s.stage = 6;
    s.sheet.merits = { resources: 3 };
    const r = validateCurrentStage(s);
    assertEquals(r.valid, false);
    assertStringIncludes(r.error ?? "", "10");
  });
});

describe("Vampire +cg/list", OPTS, () => {
  it("unlocks vampire topics only", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    assert(isVampire(sheet));
    const topics = eligibleListTopics(sheet);
    assert(topics.has("clans"));
    assert(topics.has("covenants"));
    assert(topics.has("disciplines"));
    assert(topics.has("masks"));
    assertEquals(topics.has("seemings"), false);
    assertEquals(topics.has("virtues"), false);
  });

  it("lists clans and marks in-clan disciplines", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    sheet = setTrait(sheet, "clan", "Nosferatu");
    assertEquals(eligibleClans(sheet).length, 5);
    assertEquals(eligibleCovenants(sheet).length, 6);
    assertEquals(eligibleDisciplines(sheet).length, 10);

    const clans = renderCgList("clans", sheet);
    assertStringIncludes(clans, "Daeva");
    assertStringIncludes(clans, "Ventrue");

    const discs = renderCgList("disciplines", sheet);
    assertStringIncludes(discs, "Nightmare");
    // Nosferatu in-clan marked with *
    assertStringIncludes(discs, "Nightmare%cn*");
  });

  it("lists Mask/Dirge archetypes", () => {
    let sheet = defaultSheet();
    sheet = setTrait(sheet, "template", "vampire");
    const out = renderCgList("masks", sheet);
    assertStringIncludes(out, "Authoritarian");
    assertStringIncludes(out, "Survivor");
  });

  it("locks clan list for non-vampires", () => {
    const out = renderCgList("clans", defaultSheet());
    assertStringIncludes(out.toLowerCase(), "vampire");
  });
});

describe("Vampire +info", OPTS, () => {
  it("looks up clan and Discipline", () => {
    const clan = renderInfo("Daeva");
    assertStringIncludes(clan, "Daeva");
    assertStringIncludes(clan, "Clan");
    assertStringIncludes(clan, "Majesty");

    const disc = renderInfo("Auspex");
    assertStringIncludes(disc, "Discipline");
    assertStringIncludes(disc, "Mekhet");
  });
});
