/**
 * Conditions, concentration, currency, inspiration, XP.
 */
import { assertEquals, assert } from "@std/assert";
import {
  defaultSheet,
  migrateSheet,
} from "../src/stats/dnd_sheet.ts";
import {
  addCondition,
  removeCondition,
  attackRollAdv,
  abilityCheckAdv,
  expandEffects,
  effectiveSpeed,
} from "../src/stats/conditions.ts";
import {
  startConcentration,
  checkConcentration,
  clearConcentration,
} from "../src/stats/concentration.ts";
import {
  addCoins,
  spendCoins,
  totalCp,
  formatPurse,
  syncGoldField,
} from "../src/stats/currency.ts";
import {
  rollD20Adv,
  maybeSpendInspiration,
  setInspiration,
  setExhaustion,
  getXpRequired,
  addXp,
  spellcastingAbility,
} from "../src/stats/rules.ts";
import { longRest } from "../src/stats/vitality.ts";
import {
  conditionBySlug,
  spellBySlug,
  CONDITIONS,
  SPELLS,
} from "../src/data/catalog.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

function base() {
  return migrateSheet(defaultSheet());
}

Deno.test("conditions catalog loads", OPTS, () => {
  assert(CONDITIONS.length >= 14);
  assertEquals(conditionBySlug("prone")?.name, "Prone");
  assertEquals(conditionBySlug("Poisoned")?.slug, "poisoned");
});

Deno.test("spells catalog loads", OPTS, () => {
  assert(Object.keys(SPELLS).length >= 100);
  const gb = spellBySlug("Guiding Bolt");
  assert(gb);
  assertEquals(gb.damage, "4d6");
  assertEquals(gb.attack, "ranged");
  assertEquals(spellBySlug("hex")?.concentration, true);
  assertEquals(spellBySlug("fireball")?.halfOnSave, true);
});

Deno.test("add/remove condition", OPTS, () => {
  let s = base();
  const a = addCondition(s, "prone");
  assertEquals(a.added, true);
  assertEquals(a.sheet.conditions.includes("prone"), true);
  const dup = addCondition(a.sheet, "prone");
  assertEquals(dup.added, false);
  const r = removeCondition(a.sheet, "prone");
  assertEquals(r.removed, true);
  assertEquals(r.sheet.conditions.length, 0);
});

Deno.test("unconscious expands prone melee adv", OPTS, () => {
  let s = base();
  s = addCondition(s, "unconscious").sheet;
  const fx = expandEffects(s.conditions);
  assert(fx.has("attacks_against_advantage"));
  assert(fx.has("no_actions"));
  // nested prone effects
  assert(fx.has("melee_against_advantage"));
});

Deno.test("attackRollAdv poisoned attacker = dis", OPTS, () => {
  let atk = base();
  atk = addCondition(atk, "poisoned").sheet;
  const def = base();
  assertEquals(attackRollAdv(atk, def), "disadvantage");
});

Deno.test("attackRollAdv prone target melee adv", OPTS, () => {
  const atk = base();
  let def = addCondition(base(), "prone").sheet;
  assertEquals(
    attackRollAdv(atk, def, { ranged: false }),
    "advantage",
  );
  assertEquals(
    attackRollAdv(atk, def, { ranged: true }),
    "disadvantage",
  );
});

Deno.test("exhaustion 3 attack dis; 1 ability dis", OPTS, () => {
  let s = setExhaustion(base(), 3);
  assertEquals(attackRollAdv(s, base()), "disadvantage");
  s = setExhaustion(base(), 1);
  assertEquals(abilityCheckAdv(s), "disadvantage");
  s = setExhaustion(base(), 5);
  assertEquals(effectiveSpeed(s), 0);
});

Deno.test("rollD20Adv advantage takes max", OPTS, () => {
  let i = 0;
  const rng = () => {
    // floor(x*20)+1 → values 3 then 17
    const seq = [2 / 20, 16 / 20];
    return seq[i++] ?? 0;
  };
  const r = rollD20Adv("advantage", rng);
  assertEquals(r.roll, 17);
  const r2 = rollD20Adv("disadvantage", () => {
    // always mid
    return 0.5;
  });
  assertEquals(r2.usedAdv, "disadvantage");
});

Deno.test("inspiration spend grants advantage", OPTS, () => {
  let s = setInspiration(base(), true);
  const r = maybeSpendInspiration(s, true, "normal");
  assertEquals(r.spent, true);
  assertEquals(r.adv, "advantage");
  assertEquals(r.sheet.inspiration, false);
  // cancels dis
  s = setInspiration(base(), true);
  const r2 = maybeSpendInspiration(s, true, "disadvantage");
  assertEquals(r2.adv, "normal");
});

Deno.test("concentration DC and break", OPTS, () => {
  let s = startConcentration(base(), "hex", "t1");
  assertEquals(s.concentration?.spell, "hex");
  // force fail: roll 1, con mod 0, dmg 20 → DC 10
  const fail = checkConcentration(s, 20, () => 0);
  assertEquals(fail.broke, true);
  assertEquals(fail.sheet.concentration, null);
  s = startConcentration(base(), "bless");
  // force succeed: roll 20
  const ok = checkConcentration(s, 20, () => 0.99);
  assertEquals(ok.broke, false);
  assertEquals(ok.sheet.concentration?.spell, "bless");
  s = clearConcentration(s);
  assertEquals(s.concentration, null);
});

Deno.test("currency add spend convert", OPTS, () => {
  let s = base();
  s.money = { cp: 0, sp: 0, ep: 0, gp: 5, pp: 0 };
  s = syncGoldField(s);
  assertEquals(s.gold, 5);
  s = addCoins(s, 10, "sp");
  assertEquals(totalCp(s), 5 * 100 + 10 * 10);
  const spent = spendCoins(s, 1, "gp");
  assert(spent);
  assertEquals(totalCp(spent!), totalCp(s) - 100);
  assert(formatPurse(spent!).includes("gp") ||
    formatPurse(spent!).includes("sp"));
  const broke = spendCoins(base(), 9999, "gp");
  assertEquals(broke, null);
});

Deno.test("long rest reduces exhaustion by 1", OPTS, () => {
  let s = setExhaustion(base(), 3);
  const r = longRest(s);
  assertEquals(r.ok, true);
  assertEquals(r.sheet.exhaustion, 2);
});

Deno.test("XP thresholds and addXp", OPTS, () => {
  assertEquals(getXpRequired(1), 0);
  assertEquals(getXpRequired(2), 300);
  assertEquals(getXpRequired(5), 6500);
  let s = addXp(base(), 300);
  assertEquals(s.xp, 300);
});

Deno.test("spellcasting ability by class", OPTS, () => {
  let s = base();
  s.class = "Wizard";
  assertEquals(spellcastingAbility(s), "intelligence");
  s.class = "Cleric";
  assertEquals(spellcastingAbility(s), "wisdom");
  s.class = "Sorcerer";
  assertEquals(spellcastingAbility(s), "charisma");
});

Deno.test("migrateSheet fills rules fields", OPTS, () => {
  const s = migrateSheet({
    class: "Fighter",
    level: 1,
    gold: 50,
  });
  assertEquals(Array.isArray(s.conditions), true);
  assertEquals(s.inspiration, false);
  assertEquals(s.exhaustion, 0);
  assertEquals(s.money.gp, 50);
  assertEquals(s.gold, 50);
  assertEquals(s.concentration, null);
});
