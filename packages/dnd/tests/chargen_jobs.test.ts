/**
 * Chargen → CGEN job → approve / deny.
 */
import { assertEquals, assert } from "@std/assert";
import { initCgState } from "../src/chargen/state.ts";
import { buildSheetFromCg } from "../src/chargen/build_sheet.ts";
import {
  parseTargetAndNotes,
  normId,
  samePlayer,
} from "../src/chargen/job_helpers.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("buildSheetFromCg produces level-1 fighter", OPTS, () => {
  const cg = initCgState();
  cg.class = "Fighter";
  cg.species = "Human";
  cg.background = "Soldier";
  cg.abilities = {
    strength: 15,
    dexterity: 14,
    constitution: 13,
    intelligence: 10,
    wisdom: 12,
    charisma: 8,
  };
  cg.abilityIncreases = {
    strength: 2,
    dexterity: 0,
    constitution: 1,
    intelligence: 0,
    wisdom: 0,
    charisma: 0,
  };
  cg.chosenSkills = ["athletics", "perception"];
  cg.chosenFeats = ["savage_attacker", "tough"];
  cg.startingGear = "gold";

  const sheet = buildSheetFromCg(cg);
  assertEquals(sheet.class, "Fighter");
  assertEquals(sheet.level, 1);
  assertEquals(sheet.abilities.strength, 17);
  assertEquals(sheet.skillProficiency.athletics, "proficient");
  assert(sheet.hp.max >= 1);
  assertEquals(sheet.gold, 125); // fighter starting gold
});

Deno.test("parseTargetAndNotes splits player=notes", OPTS, () => {
  assertEquals(parseTargetAndNotes("Alice"), {
    who: "Alice",
    notes: "",
  });
  assertEquals(parseTargetAndNotes("Bob=Looks good"), {
    who: "Bob",
    notes: "Looks good",
  });
});

Deno.test("normId / samePlayer tolerate # prefix", OPTS, () => {
  assertEquals(normId("#42"), "42");
  assertEquals(samePlayer("#42", "42"), true);
  assertEquals(samePlayer("1", "2"), false);
});

Deno.test("initCgState defaults not submitted", OPTS, () => {
  const cg = initCgState();
  assertEquals(cg.isSubmitted, false);
  assertEquals(cg.stage, 1);
});
