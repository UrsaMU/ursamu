/**
 * Mags, DoT, crit tables, software, drones, advance rules.
 */
import { assert, assertEquals } from "@std/assert";
import {
  ensureMag,
  magCapacity,
  magKeyFor,
  modeFromAttack,
  reloadMag,
  spendMag,
} from "../engine/mags.ts";
import {
  addDot,
  clearDots,
  igniteAndTick,
  listDots,
  tickDots,
} from "../engine/dots.ts";
import {
  rollCyberlimbMalfunction,
  rollCybershellCritical,
  rollVehicleCritical,
} from "../engine/crit-tables.ts";
import {
  hasSoftware,
  installSoftware,
  removeSoftware,
  rollSystemResponse,
  softwareHackBonus,
} from "../engine/net.ts";
import { useDroneEffect } from "../engine/drones.ts";
import {
  apCost,
  applyAdvance,
  edgeMax,
  grantAp,
} from "../engine/advance-rules.ts";
import { defaultChar } from "../db/schemas.ts";
import type { SprawlItemData } from "../db/schemas.ts";
import { applyResilience } from "../engine/action.ts";
import { buildItemData } from "../engine/items.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("mag capacity by category", OPTS, () => {
  assertEquals(
    magKeyFor({ category: "smg", slug: "x", kind: "firearm" }),
    "smg",
  );
  assertEquals(
    magCapacity({ category: "smg", slug: "x", kind: "firearm" }),
    20,
  );
  assertEquals(
    magCapacity({
      category: "handgun",
      slug: "pkd-45",
      kind: "firearm",
    }),
    6,
  );
});

Deno.test("spendMag shot burst auto", OPTS, () => {
  let d: SprawlItemData = ensureMag({
    slug: "hak-g55",
    kind: "firearm",
    load: 1,
    category: "smg",
  });
  assertEquals(d.mag, 20);
  const shot = spendMag(d, "shot");
  assert(shot.ok);
  assertEquals(shot.spent, 1);
  assertEquals(shot.left, 19);
  d = shot.data;
  const burst = spendMag(d, "burst");
  assert(burst.ok && burst.spent === 3);
  d = burst.data;
  const auto = spendMag(d, "auto");
  assert(auto.ok);
  assertEquals(auto.left, 0);
  const empty = spendMag(auto.data, "shot");
  assert(!empty.ok);
  const full = reloadMag(auto.data);
  assertEquals(full.mag, full.magMax);
});

Deno.test("modeFromAttack maps modes", OPTS, () => {
  assertEquals(modeFromAttack("auto"), "auto");
  assertEquals(modeFromAttack("burst"), "burst");
  assertEquals(modeFromAttack("aim"), "shot");
});

Deno.test("buildItemData sets mag on firearm", OPTS, () => {
  const d = buildItemData({
    slug: "kr-16",
    kind: "firearm",
    category: "rifle",
    load: 1,
  });
  assertEquals(d.magMax, 30);
  assertEquals(d.mag, 30);
});

Deno.test("DoT add and tick", OPTS, () => {
  let c = defaultChar("Neon");
  c = addDot(c, { kind: "fire", rounds: 3, dmg: 1 });
  assertEquals(listDots(c).length, 1);
  const t1 = tickDots(c, applyResilience);
  assertEquals(t1.totalDmg, 1);
  assertEquals(t1.next.resilience, c.resilience - 1);
  assertEquals(listDots(t1.next)[0].rounds, 2);
  let next = t1.next;
  next = tickDots(next, applyResilience).next;
  next = tickDots(next, applyResilience).next;
  assertEquals(listDots(next).length, 0);
  next = clearDots(addDot(next, { kind: "acid", rounds: 2, dmg: 1 }));
  assertEquals(listDots(next).length, 0);
});

Deno.test("igniteAndTick burns immediately", OPTS, () => {
  const c = defaultChar("Razor");
  c.resilience = 10;
  const r = igniteAndTick(
    c,
    { kind: "fire", rounds: 3, dmg: 1 },
    applyResilience,
  );
  assert(r.applied);
  assertEquals(r.totalDmg, 1);
  assertEquals(r.next.resilience, 9);
  // 3 rounds set, 1 ticked → 2 left
  assertEquals(listDots(r.next)[0].rounds, 2);
});

Deno.test("vehicle and limb crit tables", OPTS, () => {
  const v = rollVehicleCritical(false, () => 0.99);
  assert(v.roll >= 1 && v.roll <= 7);
  assert(v.effect.length > 5);
  const limb = rollCyberlimbMalfunction(() => 0.5);
  assert(limb.roll >= 2 && limb.roll <= 12);
  const shell = rollCybershellCritical(false, () => 0.1);
  assert(shell.location);
  assert(shell.effect);
});

Deno.test("software install and hack bonus", OPTS, () => {
  let c = defaultChar("Neon");
  c = { ...c, console: "hyperion" };
  const r = installSoftware(c, "tunnel-rat");
  assert(!("error" in r));
  c = r;
  assert(hasSoftware(c, "tunnel-rat"));
  const b = softwareHackBonus(c, "find");
  assert(b.bonus >= 1);
  const rm = removeSoftware(c, "tunnel-rat");
  assert(!("error" in rm));
  assert(!hasSoftware(rm, "tunnel-rat"));
  const sys = rollSystemResponse(() => 0);
  assert(sys.name);
});

Deno.test("drone medi and bomb effects", OPTS, () => {
  const c = defaultChar("Neon");
  c.resilience = 10;
  const medi = useDroneEffect(c, {
    slug: "medi-drone",
    kind: "drone",
    load: 1,
  });
  assert(medi.ok);
  assertEquals(medi.sheet?.resilience, 12);
  const bomb = useDroneEffect(c, {
    slug: "bomb-drone",
    kind: "drone",
    load: 1,
  }, () => 6);
  assert(bomb.destroy);
  assert(bomb.message.includes("18") || bomb.message.includes("blast"));
});

Deno.test("advance is AP-only; level from lifetime", OPTS, () => {
  let c = defaultChar("Neon");
  c.chargenComplete = true;
  const fail = applyAdvance(c, "reaction", "ap");
  assert(!fail.ok);

  c = grantAp(defaultChar("Neon"), apCost());
  assertEquals(c.ap, apCost());
  assertEquals(c.apTotal, apCost());
  assertEquals(c.level, 1);

  const ap = applyAdvance(c, "resilience", "ap");
  assert(ap.ok);
  if (ap.ok) {
    assertEquals(ap.next.ap, 0);
    assertEquals(ap.next.apTotal, apCost());
    assertEquals(ap.next.level, 1);
    assertEquals(ap.next.resilienceMax, 13);
  }

  c = grantAp(defaultChar("Neon"), apCost());
  c.edgeRating = edgeMax();
  const edgeFail = applyAdvance(c, "edge", "ap");
  assert(!edgeFail.ok);
});
