import { assertEquals, assert } from "@std/assert";
import {
  ammoSpecialty,
  drowningPenalty,
  explosiveDamage,
  fallingDamage,
  isMonofilament,
  isShotgun,
  knifeToGunfight,
  monofilamentAdjust,
  parseMultiDs,
  shotgunDamageBonus,
  shotgunMaxTargets,
} from "../engine/specialty-combat.ts";
import type { SprawlItemData } from "../db/schemas.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("isShotgun detects tags and category", OPTS, () => {
  assert(isShotgun({
    slug: "street-12g",
    kind: "firearm",
    load: 1,
    tags: ["shotgun"],
  }));
  assert(isShotgun({
    slug: "x",
    kind: "firearm",
    load: 1,
    category: "shotgun",
  }));
  assertEquals(
    isShotgun({ slug: "pkd-45", kind: "firearm", load: 1 }),
    false,
  );
});

Deno.test("shotgun damage by band", OPTS, () => {
  assertEquals(shotgunDamageBonus("pb"), 3);
  assertEquals(shotgunDamageBonus("close"), 2);
  assertEquals(shotgunDamageBonus("range"), 0);
  assertEquals(shotgunMaxTargets(), 3);
});

Deno.test("monofilament ignores armour, +1 if bare", OPTS, () => {
  const mono: SprawlItemData = {
    slug: "monoknife",
    kind: "melee",
    load: 1,
    tags: ["monofilament"],
  };
  assert(isMonofilament(mono));
  const vsArmor = monofilamentAdjust({
    weapon: mono,
    targetArmourBonus: 1,
  });
  assertEquals(vsArmor.ignoreArmour, true);
  assertEquals(vsArmor.damageBonus, 0);
  assert(vsArmor.parts.some((p) => /mono/i.test(p)));

  const bare = monofilamentAdjust({
    weapon: mono,
    targetArmourBonus: 0,
  });
  assertEquals(bare.damageBonus, 1);
});

Deno.test("ammo specialty tags", OPTS, () => {
  const he = ammoSpecialty(["high-explosive", "he"]);
  assertEquals(he.damageBonus, 2);
  const shred = ammoSpecialty(["shredders"]);
  assertEquals(shred.ignoreArmour, true);
  const hell = ammoSpecialty(["hellfires"]);
  assertEquals(hell.fireRounds, 3);
  const splinter = ammoSpecialty(["splinters"]);
  assertEquals(splinter.damageBonus, 1);
});

Deno.test("falling and drowning", OPTS, () => {
  assertEquals(fallingDamage(1), 1);
  assertEquals(fallingDamage(3), 1);
  assertEquals(fallingDamage(4), 2);
  assertEquals(fallingDamage(10), 4);
  assertEquals(drowningPenalty(0), 0);
  assertEquals(drowningPenalty(3), 3);
});

Deno.test("explosive always at least min of Nd6", OPTS, () => {
  let i = 0;
  const seq = [1, 1, 1, 1];
  const r = explosiveDamage(2, () => seq[i++] ?? 1);
  assertEquals(r.dice, 2);
  assertEquals(r.total, 2); // floor N ones
  assertEquals(r.rolls, [1, 1]);
  // Force below floor: rng returns 0 → clamped to 1
  i = 0;
  const r2 = explosiveDamage(3, () => 0);
  assertEquals(r2.total, 3);
  assertEquals(r2.minApplied, true);
});

Deno.test("parseMultiDs up to three", OPTS, () => {
  assertEquals(parseMultiDs("10,12,14"), [10, 12, 14]);
  assertEquals(parseMultiDs("10 12 14 extra"), [10, 12, 14]);
  assertEquals(parseMultiDs("10"), [10]);
});

Deno.test("knife to gunfight flags", OPTS, () => {
  const k = knifeToGunfight({ unaware: true });
  assertEquals(k.stat, "morphology");
  assertEquals(k.upgrade, 1);
  assert(k.parts.some((p) => /knife/i.test(p)));
});
