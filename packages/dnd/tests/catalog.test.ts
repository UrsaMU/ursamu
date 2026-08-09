/**
 * JSON catalog shape + lookup smoke.
 */
import { assertEquals, assert } from "@std/assert";
import {
  BACKGROUND_METADATA,
  CLASS_METADATA,
  CONDITIONS,
  FEATS,
  NPC_TEMPLATES,
  ORIGIN_FEATS,
  SPECIES,
  SKILL_ENTRIES,
  SPELLS,
  backgroundBySlug,
  classBySlug,
  conditionBySlug,
  isKnownSpecies,
  isOriginFeatSlug,
  listNpcSlugs,
  npcBySlug,
  spellBySlug,
  spellsByLevel,
} from "../src/data/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("classes table has 12 SRD classes", OPTS, () => {
  const keys = Object.keys(CLASS_METADATA);
  assertEquals(keys.length, 12);
  assert(CLASS_METADATA.fighter.hitDie === 10);
  assert(CLASS_METADATA.wizard.spellcasting?.spellCount === 4);
  assert(CLASS_METADATA.bard.skillOptions.length === 18);
  const f = classBySlug("Fighter");
  assertEquals(f?.hitDie, 10);
});

Deno.test("backgrounds grant skills + feat", OPTS, () => {
  assertEquals(Object.keys(BACKGROUND_METADATA).length, 6);
  const sol = backgroundBySlug("soldier");
  assert(sol);
  assertEquals(sol.skills.includes("athletics"), true);
  assertEquals(sol.feat, "Savage Attacker");
});

Deno.test("feats and origin slug list align", OPTS, () => {
  assertEquals(FEATS.length, ORIGIN_FEATS.length);
  assertEquals(ORIGIN_FEATS.includes("alert"), true);
  assertEquals(isOriginFeatSlug("Lucky"), true);
  assertEquals(isOriginFeatSlug("not_a_feat"), false);
});

Deno.test("species catalog drives validation", OPTS, () => {
  assert(SPECIES.length >= 4);
  assertEquals(isKnownSpecies("Human"), true);
  assertEquals(isKnownSpecies("dragonborn"), true);
  assertEquals(isKnownSpecies("beholder"), false);
});

Deno.test("npc templates load from JSON", OPTS, () => {
  const g = npcBySlug("goblin");
  assert(g);
  assertEquals(g.hp, 7);
  assertEquals(g.weapon?.name, "Scimitar");
  assert(NPC_TEMPLATES.orc.xp === 100);
  assert(Object.keys(NPC_TEMPLATES).length >= 100);
  assertEquals(npcBySlug("ogre")?.cr, "2");
  assert(npcBySlug("priest")?.spells?.includes("cure_wounds"));
  assert(listNpcSlugs().length >= 100);
});

Deno.test("spellsByLevel groups cantrips and L3", OPTS, () => {
  assert(spellsByLevel(0).length >= 20);
  assert(spellsByLevel(3).some((s) => s.slug === "fireball"));
});

Deno.test("skills table has 18 entries", OPTS, () => {
  assertEquals(SKILL_ENTRIES.length, 18);
  assertEquals(SKILL_ENTRIES[0].slug, "athletics");
});

Deno.test("every class entry cites book", OPTS, () => {
  for (const c of Object.values(CLASS_METADATA)) {
    assertEquals(c.book, "SRD 5.2");
    assert(typeof c.hitDie === "number");
    assert(Array.isArray(c.saves));
    assert(Array.isArray(c.skillOptions));
  }
});

Deno.test("conditions and spells tables", OPTS, () => {
  assert(CONDITIONS.length >= 14);
  assertEquals(conditionBySlug("restrained")?.slug, "restrained");
  assert(Object.keys(SPELLS).length >= 100);
  assertEquals(spellBySlug("cure_wounds")?.healing, "1d8");
  assertEquals(spellBySlug("Magic Missile")?.autoHit, true);
  assertEquals(spellBySlug("fireball")?.damage, "8d6");
  assertEquals(spellBySlug("fireball")?.halfOnSave, true);
  assertEquals(spellBySlug("armor_of_agathys")?.tempHp, "5");
  // Every class chargen option resolves
  for (const c of Object.values(CLASS_METADATA)) {
    const sc = c.spellcasting;
    if (!sc) continue;
    for (const slug of [
      ...(sc.cantripOptions ?? []),
      ...(sc.spellOptions ?? []),
    ]) {
      assert(
        spellBySlug(slug),
        `missing spell for class option: ${slug}`,
      );
    }
  }
});
