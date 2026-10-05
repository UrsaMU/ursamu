import { assertEquals, assert } from "@std/assert";
import {
  netMode,
  roll2d6,
  rollNd6,
} from "../engine/dice.ts";
import {
  resolveAction,
} from "../engine/action.ts";
import {
  defaultChar,
  overloadFrom,
  sumLoad,
  statTotal,
} from "../db/schemas.ts";
import {
  rollCritical,
  stabilizeCritical,
} from "../engine/damage.ts";

const OPTS = { sanitizeResources: false, sanitizeOps: false };

Deno.test("netMode cancels glitch and upgrade", OPTS, () => {
  assertEquals(netMode(1, 1), "normal");
  assertEquals(netMode(2, 1), "glitch");
  assertEquals(netMode(1, 2), "upgrade");
  assertEquals(netMode(0, 0), "normal");
});

Deno.test("roll2d6 normal keeps two dice", OPTS, () => {
  let i = 0;
  const seq = [3, 4];
  const r = roll2d6("normal", () => seq[i++]);
  assertEquals(r.kept, [3, 4]);
  assertEquals(r.total, 7);
  assertEquals(r.doubleSix, false);
});

Deno.test("roll2d6 glitch keeps worst two", OPTS, () => {
  let i = 0;
  const seq = [6, 1, 2];
  const r = roll2d6("glitch", () => seq[i++]);
  assertEquals(r.kept, [1, 2]);
  assertEquals(r.total, 3);
});

Deno.test("roll2d6 upgrade keeps best two", OPTS, () => {
  let i = 0;
  const seq = [1, 5, 6];
  const r = roll2d6("upgrade", () => seq[i++]);
  assertEquals(r.kept, [5, 6]);
  assertEquals(r.total, 11);
});

Deno.test("double six explodes", OPTS, () => {
  let i = 0;
  const seq = [6, 6, 4];
  const r = roll2d6("normal", () => seq[i++]);
  assert(r.doubleSix);
  assertEquals(r.explodeBonus, 4);
  assertEquals(r.total, 16);
});

Deno.test("dangerous action damages by margin", OPTS, () => {
  let i = 0;
  // 5+5=10 + stat2 + bonus1 = 13 vs DS10 → dmg 3 to target
  const seq = [5, 5];
  const r = resolveAction({
    stat: "reaction",
    statValue: 2,
    bonuses: 1,
    ds: 10,
    dangerous: true,
  }, () => seq[i++]);
  assertEquals(r.success, true);
  assertEquals(r.damageToTarget, 3);
  assertEquals(r.damageToSelf, 0);
});

Deno.test("failed dangerous damages self", OPTS, () => {
  let i = 0;
  const seq = [1, 2]; // 3 + 0 = 3 vs 10 → self 7
  const r = resolveAction({
    stat: "morphology",
    statValue: 0,
    bonuses: 0,
    ds: 10,
    dangerous: true,
  }, () => seq[i++]);
  assertEquals(r.success, false);
  assertEquals(r.damageToSelf, 7);
});

Deno.test("chargen defaults and overload", OPTS, () => {
  const c = defaultChar("X");
  assertEquals(c.resilience, 12);
  assertEquals(c.loadoutMax, 10);
  assertEquals(statTotal(c.stats), 0);
  const rows = Array.from({ length: 12 }, (_, n) => ({
    slug: `i${n}`,
    load: 1,
  }));
  assertEquals(sumLoad(rows), 12);
  assertEquals(overloadFrom(12, c.loadoutMax), 2);
});

Deno.test("critical severity can fatal at 7+", OPTS, () => {
  const injury = rollCritical(false, () => 6);
  assertEquals(injury.severity, 6);
  assert(injury.location.length > 0);
  assert(injury.flags?.includes("glitch"));
  const stacked = rollCritical(true, () => 6);
  // 6+3 = 9 → fatal band
  assert(stacked.severity >= 7);
  assert(stacked.dieRounds != null || stacked.flags?.includes("dying"));
  assert((stacked.penalty ?? 0) >= 2);
});

Deno.test("critical location penalties arm/leg", OPTS, () => {
  // force loc by custom rng: first sev, second loc
  let n = 0;
  const seq = [4, 5]; // sev 4 arterial, loc arm
  const inj = rollCritical(false, () => seq[n++] ?? 1);
  assertEquals(inj.location, "arm");
  assert(inj.flags?.includes("no-wield") || (inj.penalty ?? 0) > 0);
});

Deno.test("stabilizeCritical stops bleed and dying", OPTS, () => {
  const c = defaultChar("Bleed");
  c.chargenComplete = true;
  c.critical = {
    severity: 7,
    severityName: "fatal",
    location: "torso",
    effect: "Core opened.",
    at: 1,
    bleed: 2,
    dieRounds: 2,
    flags: ["glitch", "bleed", "dying"],
    penalty: 3,
  };
  const st = stabilizeCritical(c);
  assert(st.changed);
  assertEquals(st.next.critical?.bleed, undefined);
  assertEquals(st.next.critical?.dieRounds, undefined);
  assert(st.next.critical?.flags?.includes("stabilized"));
  assert(st.next.critical?.flags?.includes("glitch"));
  assert(!st.next.critical?.flags?.includes("dying"));
});

Deno.test("rollNd6 sums n dice", OPTS, () => {
  let i = 0;
  const seq = [2, 3, 4];
  assertEquals(rollNd6(3, () => seq[i++]), 9);
});
