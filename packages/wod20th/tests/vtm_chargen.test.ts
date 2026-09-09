// tests/vtm_chargen.test.ts -- VtM splat chargen core
import {
  assertEquals,
  assertExists,
  assert,
} from "jsr:@std/assert";

import "../splats/vtm/index.ts";
import { SplatRegistry } from "../core/registry.ts";
import {
  applySet,
  applySpend,
  applyPriority,
  seedVtmDerived,
} from "../core/chargen.ts";
import { validateStep } from "../core/validator.ts";
import { resolveTrait } from "../core/resolver.ts";
import { formatSheet } from "../core/renderer.ts";
import type { IWoDChar } from "../core/types.ts";
import {
  generationFromBgDots,
  applyGenerationPools,
} from "../splats/vtm/data/generation.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function blankVtm(): IWoDChar {
  const now = Date.now();
  return {
    id: "test-vtm-1",
    playerId: "player-1",
    splat: "vtm",
    status: "draft",
    chargenStep: 1,
    concept: "",
    attributePriority: ["", "", ""],
    attributes: {},
    attributeSpecialties: {},
    abilityPriority: ["", "", ""],
    abilities: {},
    abilitySpecialties: {},
    backgrounds: {},
    willpower: 1,
    freebiesRemaining: 15,
    freebiesLog: [],
    xpTotal: 0,
    xpSpent: 0,
    staffNotes: "",
    statLog: [],
    notes: [],
    createdAt: now,
    updatedAt: now,
  };
}

/** Walk steps 1-4 so step-5 applySet gates pass. */
function prepThroughAbilities(c: IWoDChar): void {
  assertEquals(applySet(c, "clan", "Brujah").ok, true);
  assertEquals(applySet(c, "fullName", "Cassidy Rook").ok, true);
  assertEquals(applySet(c, "age", "28").ok, true);
  assertEquals(applySet(c, "concept", "Anarch").ok, true);
  assertEquals(applySet(c, "nature", "Rebel").ok, true);
  assertEquals(applySet(c, "demeanor", "Bravo").ok, true);
  assertEquals(
    applyPriority(c, "attrs", "social/physical/mental").ok,
    true,
  );
  applySet(c, "Charisma", "3");
  applySet(c, "Manipulation", "2");
  applySet(c, "Appearance", "2");
  applySet(c, "Strength", "2");
  applySet(c, "Dexterity", "2");
  applySet(c, "Stamina", "1");
  applySet(c, "Perception", "1");
  applySet(c, "Intelligence", "1");
  applySet(c, "Wits", "1");
  assertEquals(validateStep(c, 3).complete, true, "attrs");
  assertEquals(
    applyPriority(c, "abilities", "talents/skills/knowledges").ok,
    true,
  );
  applySet(c, "Brawl", "3");
  applySet(c, "Streetwise", "3");
  applySet(c, "Intimidation", "3");
  applySet(c, "Expression", "2");
  applySet(c, "Alertness", "2");
  applySet(c, "Melee", "3");
  applySet(c, "Drive", "2");
  applySet(c, "Stealth", "2");
  applySet(c, "Firearms", "2");
  applySet(c, "Academics", "2");
  applySet(c, "Investigation", "2");
  applySet(c, "Law", "1");
  assertEquals(
    validateStep(c, 4).complete,
    true,
    validateStep(c, 4).issues.join("; "),
  );
  c.chargenStep = 5;
}

Deno.test("vtm splat is registered", OPTS, () => {
  const s = SplatRegistry.get("vtm");
  assertExists(s);
  assertEquals(s!.name, "Vampire: the Masquerade");
  assertEquals(s!.freebieTable.discipline, 7);
  assertEquals(s!.incapLabel, "Torpor");
});

Deno.test("generation table maps BG dots", OPTS, () => {
  assertEquals(generationFromBgDots(0), 13);
  assertEquals(generationFromBgDots(2), 11);
  assertEquals(generationFromBgDots(5), 8);
  const r = applyGenerationPools(11);
  assertEquals(r.bloodMax, 12);
  assertEquals(r.bloodPerTurn, 1);
});

Deno.test("resolveTrait clan + disciplines + virtues", OPTS, () => {
  const c = blankVtm();
  const clan = resolveTrait(c, "clan");
  assertEquals(clan.found, true);
  assertEquals(clan.field, "clan");
  assert(clan.enumValues!.includes("brujah"));

  const pot = resolveTrait(c, "Potence");
  assertEquals(pot.found, true);
  assertEquals(pot.field, "disciplines.Potence");

  const sc = resolveTrait(c, "Self-Control");
  assertEquals(sc.found, true);
  assertEquals(sc.field, "virtues.Self-Control");
});

Deno.test("applyClan seeds Brujah defaults", OPTS, () => {
  const c = blankVtm();
  const r = applySet(c, "clan", "Brujah");
  assertEquals(r.ok, true, r.message);
  assertEquals(c.clan, "brujah");
  assertEquals(c.generation, 13);
  assertEquals(c.path, "Humanity");
  assertExists(c.virtues);
  assertEquals(c.bloodMax, 10);
  const step1 = validateStep(c, 1);
  assertEquals(step1.complete, true, step1.issues.join("; "));
});

Deno.test("vtm step 5 disciplines + virtues budget", OPTS, () => {
  const c = blankVtm();
  prepThroughAbilities(c);

  assertEquals(applySet(c, "Potence", "2").ok, true);
  assertEquals(applySet(c, "Presence", "1").ok, true);
  assertEquals(applySet(c, "Contacts", "3").ok, true);
  assertEquals(applySet(c, "Resources", "2").ok, true);
  assertEquals(applySet(c, "Conscience", "3").ok, true);
  assertEquals(applySet(c, "Self-Control", "3").ok, true);
  assertEquals(applySet(c, "Courage", "4").ok, true);
  seedVtmDerived(c);
  assertEquals(c.willpower, 4);
  assertEquals(c.humanity, 6);

  const step5 = validateStep(c, 5);
  assertEquals(step5.complete, true, step5.issues.join("; "));
});

Deno.test("freebie spend on discipline", OPTS, () => {
  const c = blankVtm();
  prepThroughAbilities(c);
  c.disciplines = { Potence: 2, Presence: 1 };
  c.virtues = {
    Conscience: 3,
    "Self-Control": 3,
    Courage: 4,
  };
  seedVtmDerived(c);
  c.backgrounds = { Contacts: 5 };
  c.chargenStep = 6;
  c.freebiesRemaining = 15;
  const r = applySpend(c, "Celerity", "1");
  assertEquals(r.ok, true, r.message);
  assertEquals(c.disciplines?.Celerity, 1);
  assertEquals(c.freebiesRemaining, 8);
});

Deno.test("formatSheet includes Kindred blocks", OPTS, async () => {
  const c = blankVtm();
  applySet(c, "clan", "Brujah");
  c.fullName = "Cassidy Rook";
  c.concept = "Anarch";
  c.disciplines = { Potence: 2, Presence: 1 };
  c.virtues = {
    Conscience: 2,
    "Self-Control": 2,
    Courage: 3,
  };
  seedVtmDerived(c);
  const sheet = await formatSheet(c, false, "Cassidy");
  assert(
    sheet.includes("Brujah") || sheet.includes("Clan"),
    sheet.slice(0, 300),
  );
  assert(
    sheet.includes("Potence") || sheet.includes("Discipline"),
    sheet,
  );
  assert(
    sheet.includes("Blood") || sheet.includes("Willpower"),
    sheet,
  );
});
